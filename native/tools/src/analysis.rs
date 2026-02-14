use napi_derive::napi;
use std::fs::File;
use std::path::Path;
use symphonia::core::audio::{AudioBufferRef, Signal};
use symphonia::core::codecs::DecoderOptions;
use symphonia::core::errors::Error;
use symphonia::core::formats::{FormatOptions, SeekMode, SeekTo};
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;
use symphonia::core::units::Time;

#[napi(object)]
pub struct AudioAnalysis {
    pub duration: f64,
    pub bpm: Option<f64>,
    pub bpm_confidence: Option<f64>,
    pub fade_in_pos: f64,
    pub fade_out_pos: f64,
    pub first_beat_pos: Option<f64>,
    pub loudness: Option<f64>,
    // New fields
    pub version: i32,
    pub analyze_window: f64,
    pub cut_in_pos: Option<f64>,
    pub cut_out_pos: Option<f64>,
    pub vocal_in_pos: Option<f64>,
    pub vocal_out_pos: Option<f64>,
}

struct HighPassFilter {
    prev_x: f32,
    prev_y: f32,
    alpha: f32,
}

impl HighPassFilter {
    fn new(sample_rate: u32, cutoff: f32) -> Self {
        let dt = 1.0 / sample_rate as f32;
        let rc = 1.0 / (2.0 * std::f32::consts::PI * cutoff);
        let alpha = rc / (rc + dt);
        Self { prev_x: 0.0, prev_y: 0.0, alpha }
    }
    fn process(&mut self, x: f32) -> f32 {
        let y = self.alpha * (self.prev_y + x - self.prev_x);
        self.prev_x = x;
        self.prev_y = y;
        y
    }
}

#[napi]
pub fn analyze_audio_file(path: String, max_analyze_time: Option<f64>) -> Option<AudioAnalysis> {
    let path = Path::new(&path);
    let src = File::open(path).ok()?;
    let mss = MediaSourceStream::new(Box::new(src), Default::default());

    let mut hint = Hint::new();
    if let Some(ext) = path.extension() {
        if let Some(ext_str) = ext.to_str() {
            hint.with_extension(ext_str);
        }
    }

    let meta_opts: MetadataOptions = Default::default();
    let fmt_opts: FormatOptions = Default::default();

    let probed = symphonia::default::get_probe()
        .format(&hint, mss, &fmt_opts, &meta_opts)
        .ok()?;

    let mut format = probed.format;
    let track = format.default_track()?;
    let track_id = track.id;
    let time_base = track.codec_params.time_base;
    let n_frames = track.codec_params.n_frames;
    let sample_rate = track.codec_params.sample_rate.unwrap_or(44100);

    let dec_opts: DecoderOptions = Default::default();
    let mut decoder = symphonia::default::get_codecs()
        .make(&track.codec_params, &dec_opts)
        .ok()?;

    // Analysis params
    let max_time = max_analyze_time.unwrap_or(60.0).clamp(5.0, 300.0);
    let window_size = (sample_rate as usize * 20) / 1000; // 20ms
    if window_size == 0 { return None; }

    // State
    let mut full_envelope: Vec<f32> = Vec::new(); // For BPM (head only or full if short)
    let mut head_envelope: Vec<f32> = Vec::new();
    let mut head_vocal_ratio: Vec<f32> = Vec::new();
    let mut tail_envelope: Vec<f32> = Vec::new();
    let mut tail_vocal_ratio: Vec<f32> = Vec::new();
    
    let mut current_sum_sq = 0.0;
    let mut current_high_sum_sq = 0.0;
    let mut current_count = 0;
    let mut duration = 0.0;

    // HPF for vocal detection (>300Hz)
    let mut hpf = HighPassFilter::new(sample_rate, 300.0);
    
    // Phase: 0 = Head, 1 = Tail
    let mut phase = 0;
    let mut _seek_done = false;
    
    // We will collect data into temporary buffer then decide where to put it
    let mut temp_envelope = Vec::new();
    let mut temp_vocal = Vec::new();

    let processed_duration = 0.0;

    loop {
        let packet = match format.next_packet() {
            Ok(packet) => packet,
            Err(Error::IoError(_)) => break,
            Err(Error::ResetRequired) => break,
            Err(_) => break,
        };

        if packet.track_id() != track_id {
            continue;
        }
        
        let current_time = if let Some(tb) = time_base {
             let t = tb.calc_time(packet.ts());
             t.seconds as f64 + t.frac
        } else {
             processed_duration
        };
        
        duration = current_time; // Update total duration estimation

        // Check if we need to switch phase or stop
        if phase == 0 {
            // In Head phase
            if current_time > max_time {
                // Head limit reached.
                // Save temp to head
                head_envelope.append(&mut temp_envelope);
                head_vocal_ratio.append(&mut temp_vocal);
                
                // Copy head for BPM (use at most max_time)
                full_envelope = head_envelope.clone();

                let mut total_duration = None;
                if let Some(n) = n_frames {
                    if let Some(tb) = time_base {
                        let t = tb.calc_time(n);
                        total_duration = Some(t.seconds as f64 + t.frac);
                    }
                }
                
                if let Some(tot) = total_duration {
                    if tot > max_time * 2.0 {
                        // We can seek to tot - max_time
                        let seek_time = tot - max_time;
                        let seek_ts = Time::from(seek_time);
                        
                        match format.seek(SeekMode::Accurate, SeekTo::Time { time: seek_ts, track_id: Some(track_id) }) {
                            Ok(_) => {
                                phase = 1;
                                _seek_done = true;
                                // Reset filters/state
                                current_sum_sq = 0.0;
                                current_high_sum_sq = 0.0;
                                current_count = 0;
                                continue; // Next packet will be from seek point
                            }
                            Err(_) => {
                                // Seek failed, stop
                                break;
                            }
                        }
                    } else {
                         // File too short to split, just continue scanning until end
                    }
                } else {
                    // Duration unknown, can't seek safely. Stop.
                    break;
                }
            }
        } else {
            // In Tail phase
            // Just collect until end
        }

        match decoder.decode(&packet) {
            Ok(decoded) => {
                // Process audio buffer
                 let spec = *decoded.spec();
                 let duration_frames = decoded.frames();
                 let channels = spec.channels.count();

                 // Macro or helper to handle types
                 match decoded {
                    AudioBufferRef::F32(buf) => {
                        for i in 0..duration_frames {
                            let mut sum = 0.0;
                            for c in 0..channels { sum += buf.chan(c)[i]; }
                            let val = sum / channels as f32;
                            let high = hpf.process(val);
                            
                            current_sum_sq += val * val;
                            current_high_sum_sq += high * high;
                            current_count += 1;
                            
                            if current_count >= window_size {
                                let rms = (current_sum_sq / window_size as f32).sqrt();
                                let rms_high = (current_high_sum_sq / window_size as f32).sqrt();
                                temp_envelope.push(rms);
                                let ratio = if rms > 0.0001 { rms_high / rms } else { 0.0 };
                                temp_vocal.push(ratio);
                                current_sum_sq = 0.0;
                                current_high_sum_sq = 0.0;
                                current_count = 0;
                            }
                        }
                    }
                    AudioBufferRef::U8(buf) => {
                         for i in 0..duration_frames {
                            let mut sum = 0.0;
                            for c in 0..channels { sum += (buf.chan(c)[i] as f32 - 128.0) / 128.0; }
                            let val = sum / channels as f32;
                            let high = hpf.process(val);
                            current_sum_sq += val * val;
                            current_high_sum_sq += high * high;
                            current_count += 1;
                            if current_count >= window_size {
                                let rms = (current_sum_sq / window_size as f32).sqrt();
                                let rms_high = (current_high_sum_sq / window_size as f32).sqrt();
                                temp_envelope.push(rms);
                                let ratio = if rms > 0.0001 { rms_high / rms } else { 0.0 };
                                temp_vocal.push(ratio);
                                current_sum_sq = 0.0;
                                current_high_sum_sq = 0.0;
                                current_count = 0;
                            }
                        }
                    }
                     AudioBufferRef::S16(buf) => {
                         for i in 0..duration_frames {
                            let mut sum = 0.0;
                            for c in 0..channels { sum += (buf.chan(c)[i] as f32) / 32768.0; }
                            let val = sum / channels as f32;
                            let high = hpf.process(val);
                            current_sum_sq += val * val;
                            current_high_sum_sq += high * high;
                            current_count += 1;
                            if current_count >= window_size {
                                let rms = (current_sum_sq / window_size as f32).sqrt();
                                let rms_high = (current_high_sum_sq / window_size as f32).sqrt();
                                temp_envelope.push(rms);
                                let ratio = if rms > 0.0001 { rms_high / rms } else { 0.0 };
                                temp_vocal.push(ratio);
                                current_sum_sq = 0.0;
                                current_high_sum_sq = 0.0;
                                current_count = 0;
                            }
                        }
                    }
                    AudioBufferRef::S24(buf) => {
                        for i in 0..duration_frames {
                           let mut sum = 0.0;
                           for c in 0..channels { sum += (buf.chan(c)[i].0 as f32) / 8388608.0; }
                           let val = sum / channels as f32;
                           let high = hpf.process(val);
                           current_sum_sq += val * val;
                           current_high_sum_sq += high * high;
                           current_count += 1;
                           if current_count >= window_size {
                                let rms = (current_sum_sq / window_size as f32).sqrt();
                                let rms_high = (current_high_sum_sq / window_size as f32).sqrt();
                                temp_envelope.push(rms);
                                let ratio = if rms > 0.0001 { rms_high / rms } else { 0.0 };
                                temp_vocal.push(ratio);
                                current_sum_sq = 0.0;
                                current_high_sum_sq = 0.0;
                                current_count = 0;
                           }
                       }
                   }
                   AudioBufferRef::S32(buf) => {
                        for i in 0..duration_frames {
                           let mut sum = 0.0;
                           for c in 0..channels { sum += (buf.chan(c)[i] as f32) / 2147483648.0; }
                           let val = sum / channels as f32;
                           let high = hpf.process(val);
                           current_sum_sq += val * val;
                           current_high_sum_sq += high * high;
                           current_count += 1;
                           if current_count >= window_size {
                                let rms = (current_sum_sq / window_size as f32).sqrt();
                                let rms_high = (current_high_sum_sq / window_size as f32).sqrt();
                                temp_envelope.push(rms);
                                let ratio = if rms > 0.0001 { rms_high / rms } else { 0.0 };
                                temp_vocal.push(ratio);
                                current_sum_sq = 0.0;
                                current_high_sum_sq = 0.0;
                                current_count = 0;
                           }
                       }
                   }
                    _ => {}
                }
            }
            Err(_) => break,
        }
    }
    
    // Final flush
    if current_count > 0 {
        let rms = (current_sum_sq / window_size as f32).sqrt();
        let rms_high = (current_high_sum_sq / window_size as f32).sqrt();
        temp_envelope.push(rms);
        let ratio = if rms > 0.0001 { rms_high / rms } else { 0.0 };
        temp_vocal.push(ratio);
    }
    
    // Distribute temp buffer based on phase
    if phase == 0 {
        head_envelope.append(&mut temp_envelope);
        head_vocal_ratio.append(&mut temp_vocal);
        // If we never seeked, head is full
        if full_envelope.is_empty() {
            full_envelope = head_envelope.clone();
        }
    } else {
        tail_envelope.append(&mut temp_envelope);
        tail_vocal_ratio.append(&mut temp_vocal);
    }
    
    // Analysis Logic
    let env_rate = 50.0; // 20ms
    
    // 1. Basic Silence
    let (fade_in, _) = detect_silence_from_envelope(&head_envelope, env_rate, -48.0);
    
    // For fade out, if we have tail, use tail. Else use head.
    let fade_out = if !tail_envelope.is_empty() {
        // Tail envelope starts at ? 
        // We need to know where tail starts.
        // Assuming we seeked to (duration - max_time).
        // But exact seek pos might vary. 
        // Simplified: We just scan tail backwards.
        let (_, local_out) = detect_silence_from_envelope(&tail_envelope, env_rate, -48.0);
        // Map local_out (relative to tail start) to absolute?
        // Actually detect_silence returns absolute time relative to buffer start.
        // We want time from end of file?
        // Let's rewrite detect_silence to return time from start of buffer.
        
        // fade_out_pos should be absolute time.
        // If we know duration:
        duration - (tail_envelope.len() as f64 / env_rate - local_out)
    } else {
        let (_, out) = detect_silence_from_envelope(&head_envelope, env_rate, -48.0);
        out
    };
    
    // 2. BPM (Use full envelope or head if long enough)
    let (bpm, bpm_conf, first_beat) = detect_bpm_from_envelope(&full_envelope, env_rate);
    
    // 3. Smart Cut (Vocal / Activity)
    // Heuristic: High Freq Ratio > 0.3 AND RMS > -40dB (-40dB = 0.01)
    let is_vocal = |rms: f32, ratio: f32| -> bool {
        rms > 0.01 && ratio > 0.3
    };
    
    // Detect Vocal In (in Head)
    let mut vocal_in = None;
    for (i, (&rms, &ratio)) in head_envelope.iter().zip(head_vocal_ratio.iter()).enumerate() {
        if is_vocal(rms, ratio) {
            // Debounce: check next 5 frames (100ms)
            let end = (i + 5).min(head_envelope.len());
            if (i..end).all(|j| is_vocal(head_envelope[j], head_vocal_ratio[j])) {
                 vocal_in = Some(i as f64 / env_rate);
                 break;
            }
        }
    }
    
    // Detect Vocal Out (in Tail or Head)
    let mut vocal_out = None;
    let target_env = if !tail_envelope.is_empty() { &tail_envelope } else { &head_envelope };
    let target_ratio = if !tail_vocal_ratio.is_empty() { &tail_vocal_ratio } else { &head_vocal_ratio };
    
    for (i, (&rms, &ratio)) in target_env.iter().zip(target_ratio.iter()).enumerate().rev() {
        if is_vocal(rms, ratio) {
             let start = i.saturating_sub(5);
             if (start..=i).all(|j| is_vocal(target_env[j], target_ratio[j])) {
                 let local_time = i as f64 / env_rate;
                 if !tail_envelope.is_empty() {
                      vocal_out = Some(duration - (tail_envelope.len() as f64 / env_rate - local_time));
                 } else {
                      vocal_out = Some(local_time);
                 }
                 break;
             }
        }
    }
    
    // 4. Synthesize Cut Points
    let preroll = 0.1;
    let postroll = 0.2;
    
    let cut_in = if let Some(v_in) = vocal_in {
        Some((v_in - preroll).max(fade_in))
    } else {
        Some(fade_in)
    };
    
    let cut_out = if let Some(v_out) = vocal_out {
        Some((v_out + postroll).min(fade_out))
    } else {
        Some(fade_out)
    };

    Some(AudioAnalysis {
        duration,
        bpm,
        bpm_confidence: bpm_conf,
        fade_in_pos: fade_in,
        fade_out_pos: fade_out,
        first_beat_pos: first_beat,
        loudness: None,
        // New
        version: 2,
        analyze_window: max_time,
        cut_in_pos: cut_in,
        cut_out_pos: cut_out,
        vocal_in_pos: vocal_in,
        vocal_out_pos: vocal_out,
    })
}

fn detect_silence_from_envelope(envelope: &[f32], rate: f64, threshold_db: f32) -> (f64, f64) {
    if envelope.is_empty() { return (0.0, 0.0); }
    
    let threshold = 10.0f32.powf(threshold_db / 20.0);
    
    // Forward
    let fade_in = if let Some(pos) = envelope.iter().position(|&x| x > threshold) {
        pos as f64 / rate
    } else {
        return (0.0, envelope.len() as f64 / rate);
    };
    
    // Backward
    let fade_out = if let Some(pos) = envelope.iter().rposition(|&x| x > threshold) {
        (pos + 1) as f64 / rate
    } else {
        envelope.len() as f64 / rate
    };
    
    (fade_in, fade_out)
}

fn detect_bpm_from_envelope(envelope: &[f32], rate: f64) -> (Option<f64>, Option<f64>, Option<f64>) {
    if envelope.len() < 100 { return (None, None, None); }
    
    // Compute flux
    let mut flux = Vec::with_capacity(envelope.len());
    flux.push(0.0);
    for i in 1..envelope.len() {
        let diff = envelope[i] - envelope[i-1];
        flux.push(if diff > 0.0 { diff } else { 0.0 });
    }
    
    // Autocorrelation
    // Rate 50Hz.
    // 60 BPM = 1s = 50 samples
    // 180 BPM = 0.33s = 16.6 samples
    let min_lag = 15;
    let max_lag = 55;
    
    if flux.len() < max_lag * 2 { return (None, None, None); }
    
    let mut correlations = Vec::new();
    
    for lag in min_lag..=max_lag {
        let mut corr = 0.0;
        let start_idx = 0;
        let end_idx = flux.len() - lag;
        // Step by 1 for better accuracy on envelope
        for i in start_idx..end_idx { 
            corr += flux[i] * flux[i+lag];
        }
        correlations.push((lag, corr));
    }
    
    correlations.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    
    if correlations.is_empty() { return (None, None, None); }
    
    let (best_lag, max_corr) = correlations[0];
    
    if max_corr < 0.0001 { return (None, None, None); }
    
    let period = best_lag as f64 / rate;
    let bpm = 60.0 / period;
    
    let avg_corr: f32 = correlations.iter().map(|c| c.1).sum::<f32>() / correlations.len() as f32;
    let confidence = if avg_corr > 0.0 { ((max_corr / avg_corr) - 1.0) / 5.0 } else { 0.0 };
    let confidence = confidence.clamp(0.0, 1.0) as f64;
    
    (Some(bpm), Some(confidence), None)
}
