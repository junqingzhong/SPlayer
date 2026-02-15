use napi_derive::napi;
use num_complex::Complex32;
use std::fs::File;
use std::path::Path;
use rustfft::FftPlanner;
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
    #[napi(js_name = "bpm_confidence")]
    pub bpm_confidence: Option<f64>,
    #[napi(js_name = "fade_in_pos")]
    pub fade_in_pos: f64,
    #[napi(js_name = "fade_out_pos")]
    pub fade_out_pos: f64,
    #[napi(js_name = "first_beat_pos")]
    pub first_beat_pos: Option<f64>,
    pub loudness: Option<f64>, // LUFS
    #[napi(js_name = "drop_pos")]
    pub drop_pos: Option<f64>, // Chorus/Drop start
    pub version: i32,
    #[napi(js_name = "analyze_window")]
    pub analyze_window: f64,
    #[napi(js_name = "cut_in_pos")]
    pub cut_in_pos: Option<f64>,
    #[napi(js_name = "cut_out_pos")]
    pub cut_out_pos: Option<f64>,
    #[napi(js_name = "vocal_in_pos")]
    pub vocal_in_pos: Option<f64>,
    #[napi(js_name = "vocal_out_pos")]
    pub vocal_out_pos: Option<f64>,
    #[napi(js_name = "vocal_last_in_pos")]
    pub vocal_last_in_pos: Option<f64>,
    #[napi(js_name = "outro_energy_level")]
    pub outro_energy_level: Option<f64>,
    #[napi(js_name = "key_root")]
    pub key_root: Option<i32>,
    #[napi(js_name = "key_mode")]
    pub key_mode: Option<i32>,
    #[napi(js_name = "key_confidence")]
    pub key_confidence: Option<f64>,
}

enum SnapMode { Ceil, Floor }

fn snap_to_bar(time: f64, bpm: f64, first_beat: f64, confidence: f64, mode: SnapMode) -> f64 {
    if bpm <= 0.0 || confidence < 0.4 { return time; }
    
    let seconds_per_beat = 60.0 / bpm;
    let seconds_per_bar = seconds_per_beat * 4.0; // Assume 4/4
    
    // Calculate how many bars from first_beat
    let raw_bars = (time - first_beat) / seconds_per_bar;
    
    let bars_count = match mode {
        SnapMode::Ceil => raw_bars.ceil(),
        SnapMode::Floor => raw_bars.floor(),
    };
    
    // Return snapped time
    let res = first_beat + (bars_count * seconds_per_bar);
    if res < 0.0 { first_beat } else { res }
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

struct LowPassFilter {
    prev_y: f32,
    alpha: f32,
}

impl LowPassFilter {
    fn new(sample_rate: u32, cutoff: f32) -> Self {
        let dt = 1.0 / sample_rate as f32;
        let rc = 1.0 / (2.0 * std::f32::consts::PI * cutoff);
        let alpha = dt / (rc + dt);
        Self { prev_y: 0.0, alpha }
    }
    fn process(&mut self, x: f32) -> f32 {
        let y = self.prev_y + self.alpha * (x - self.prev_y);
        self.prev_y = y;
        y
    }
}

// Biquad for K-weighting
struct BiquadFilter {
    b0: f64, b1: f64, b2: f64,
    a1: f64, a2: f64,
    z1: f64, z2: f64,
}

impl BiquadFilter {
    fn new(b0: f64, b1: f64, b2: f64, a1: f64, a2: f64) -> Self {
        Self { b0, b1, b2, a1, a2, z1: 0.0, z2: 0.0 }
    }

    fn process(&mut self, input: f64) -> f64 {
        let output = input * self.b0 + self.z1;
        self.z1 = input * self.b1 + self.z2 - self.a1 * output;
        self.z2 = input * self.b2 - self.a2 * output;
        output
    }
}

// K-weighting filters based on ITU-R BS.1770
struct LoudnessMeter {
    pre_filter: Vec<BiquadFilter>, // One per channel
    rlb_filter: Vec<BiquadFilter>, // One per channel
    sum_sq: f64,
    count: u64,
}

impl LoudnessMeter {
    fn new(sample_rate: u32, channels: usize) -> Self {
        // Coefficients for 48kHz (approximation for other rates if needed, but ideally should be calculated)
        // Here we use simplified coefficients or select based on rate.
        // For robustness, we implement generic calculation or standard tables.
        
        // Using standard coefficients for 48kHz as baseline
        // Pre-filter (High Shelf)
        // fs = 48000
        // f0 = 1681.9744509555319
        // G  = 3.99984385397
        // Q  = 0.7071752369554193
        let (pb0, pb1, pb2, pa1, pa2) = if sample_rate >= 44100 {
            // Coefficients for 48kHz (close enough for 44.1kHz for this purpose)
            (1.53512485958697, -2.69169618940638, 1.19839281085285, -1.69065929318241, 0.73248077421585)
        } else {
             // Fallback or different coeffs for lower rates. 
             // Using same for now as we mostly deal with 44.1/48 music.
            (1.53512485958697, -2.69169618940638, 1.19839281085285, -1.69065929318241, 0.73248077421585)
        };

        // RLB Filter (High Pass)
        // fc = 38.13547087613982
        // Q  = 0.5003271673671752
        let (rb0, rb1, rb2, ra1, ra2) = if sample_rate >= 44100 {
            (1.0, -2.0, 1.0, -1.99004745483398, 0.99007225036621)
        } else {
            (1.0, -2.0, 1.0, -1.99004745483398, 0.99007225036621)
        };

        let mut pre_filters = Vec::with_capacity(channels);
        let mut rlb_filters = Vec::with_capacity(channels);

        for _ in 0..channels {
            pre_filters.push(BiquadFilter::new(pb0, pb1, pb2, pa1, pa2));
            rlb_filters.push(BiquadFilter::new(rb0, rb1, rb2, ra1, ra2));
        }

        Self {
            pre_filter: pre_filters,
            rlb_filter: rlb_filters,
            sum_sq: 0.0,
            count: 0,
        }
    }

    fn process(&mut self, channels: &[f32]) {
        for (i, &sample) in channels.iter().enumerate() {
            if i >= self.pre_filter.len() { break; }
            let s = sample as f64;
            let s1 = self.pre_filter[i].process(s);
            let s2 = self.rlb_filter[i].process(s1);
            self.sum_sq += s2 * s2;
        }
        self.count += 1;
    }

    fn get_lufs(&self) -> f64 {
        if self.count == 0 { return -70.0; }
        // Mean square (average over all channels and samples)
        // EBU R 128 definition sums channels with weights (L/R=1.0), then mean over time.
        // sum_sq here accumulates sum(channel_i^2).
        // We need 1/T * sum(z_i^2).
        // Since we sum all channels into one sum_sq, we need to divide by count (which is number of frames * number of channels? No, process called once per frame).
        // Wait, `process` iterates channels. `sum_sq` accumulates all channels' energy.
        // Standard says: z_i(t) for each channel.
        // Mean Square for channel i: MS_i = 1/T * sum(z_i^2)
        // Loudness = -0.691 + 10 * log10( sum_i (G_i * MS_i) )
        // Assuming Stereo (G_L=1, G_R=1).
        // So we need separate sums for channels if we want to be exact, but for stereo it's just sum of MS.
        
        // Let's assume equal weight for all channels for simplicity (Music typically stereo).
        let mean_sq = self.sum_sq / (self.count as f64); 
        // Note: self.count is number of frames. self.sum_sq includes contribution from all channels.
        // So mean_sq is effectively sum(MS_i).
        
        if mean_sq <= 0.0 { return -70.0; }
        
        let lufs = -0.691 + 10.0 * mean_sq.log10();
        lufs
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
    let key_max_time = max_time.min(30.0);
    let key_max_samples = (sample_rate as f64 * key_max_time) as usize;

    // State
    let mut full_envelope: Vec<f32> = Vec::new(); // For BPM (head only or full if short)
    let mut full_low_envelope: Vec<f32> = Vec::new();
    let mut head_envelope: Vec<f32> = Vec::new();
    let mut head_low_envelope: Vec<f32> = Vec::new();
    let mut head_vocal_ratio: Vec<f32> = Vec::new();
    let mut head_pcm: Vec<f32> = Vec::new();
    let mut tail_envelope: Vec<f32> = Vec::new();
    let mut tail_low_envelope: Vec<f32> = Vec::new();
    let mut tail_vocal_ratio: Vec<f32> = Vec::new();
    
    let mut current_sum_sq = 0.0;
    let mut current_low_sum_sq = 0.0;
    let mut current_high_sum_sq = 0.0;
    let mut current_count = 0;
    let mut duration = 0.0;

    // HPF for vocal detection (>300Hz)
    let mut hpf = HighPassFilter::new(sample_rate, 300.0);
    let mut lpf = LowPassFilter::new(sample_rate, 150.0);
    
    // Loudness Meter
    let mut loudness_meter = LoudnessMeter::new(sample_rate, 2); // Assume stereo initially, will adapt
    
    // Phase: 0 = Head, 1 = Tail
    let mut phase = 0;
    let mut _seek_done = false;
    
    // We will collect data into temporary buffer then decide where to put it
    let mut temp_envelope = Vec::new();
    let mut temp_low_envelope = Vec::new();
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
                head_low_envelope.append(&mut temp_low_envelope);
                head_vocal_ratio.append(&mut temp_vocal);
                
                // Copy head for BPM (use at most max_time)
                full_envelope = head_envelope.clone();
                full_low_envelope = head_low_envelope.clone();

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
                                current_low_sum_sq = 0.0;
                                current_high_sum_sq = 0.0;
                                current_count = 0;
                                hpf = HighPassFilter::new(sample_rate, 300.0);
                                lpf = LowPassFilter::new(sample_rate, 150.0);
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
                 
                 // Update loudness meter channel count if needed
                 if loudness_meter.pre_filter.len() != channels {
                     loudness_meter = LoudnessMeter::new(sample_rate, channels);
                 }

                 // Macro or helper to handle types
                 match decoded {
                    AudioBufferRef::F32(buf) => {
                        for i in 0..duration_frames {
                            let mut frame_samples = Vec::with_capacity(channels);
                            let mut sum = 0.0;
                            for c in 0..channels { 
                                let s = buf.chan(c)[i];
                                frame_samples.push(s);
                                sum += s; 
                            }
                            
                            // Process Loudness
                            loudness_meter.process(&frame_samples);
                            
                            let val = sum / channels as f32;
                            if phase == 0 && head_pcm.len() < key_max_samples {
                                head_pcm.push(val);
                            }
                            let high = hpf.process(val);
                            let low = lpf.process(val);
                            
                            current_sum_sq += val * val;
                            current_low_sum_sq += low * low;
                            current_high_sum_sq += high * high;
                            current_count += 1;
                            
                            if current_count >= window_size {
                                let rms = (current_sum_sq / window_size as f32).sqrt();
                                let rms_low = (current_low_sum_sq / window_size as f32).sqrt();
                                let rms_high = (current_high_sum_sq / window_size as f32).sqrt();
                                temp_envelope.push(rms);
                                temp_low_envelope.push(rms_low);
                                let ratio = if rms > 0.0001 { rms_high / rms } else { 0.0 };
                                temp_vocal.push(ratio);
                                current_sum_sq = 0.0;
                                current_low_sum_sq = 0.0;
                                current_high_sum_sq = 0.0;
                                current_count = 0;
                            }
                        }
                    }
                    AudioBufferRef::U8(buf) => {
                         for i in 0..duration_frames {
                            let mut frame_samples = Vec::with_capacity(channels);
                            let mut sum = 0.0;
                            for c in 0..channels { 
                                let s = (buf.chan(c)[i] as f32 - 128.0) / 128.0;
                                frame_samples.push(s);
                                sum += s; 
                            }
                            loudness_meter.process(&frame_samples);

                            let val = sum / channels as f32;
                            if phase == 0 && head_pcm.len() < key_max_samples {
                                head_pcm.push(val);
                            }
                            let high = hpf.process(val);
                            current_sum_sq += val * val;
                            let low = lpf.process(val);
                            current_low_sum_sq += low * low;
                            current_high_sum_sq += high * high;
                            current_count += 1;
                            if current_count >= window_size {
                                let rms = (current_sum_sq / window_size as f32).sqrt();
                                let rms_low = (current_low_sum_sq / window_size as f32).sqrt();
                                let rms_high = (current_high_sum_sq / window_size as f32).sqrt();
                                temp_envelope.push(rms);
                                temp_low_envelope.push(rms_low);
                                let ratio = if rms > 0.0001 { rms_high / rms } else { 0.0 };
                                temp_vocal.push(ratio);
                                current_sum_sq = 0.0;
                                current_low_sum_sq = 0.0;
                                current_high_sum_sq = 0.0;
                                current_count = 0;
                            }
                        }
                    }
                     AudioBufferRef::S16(buf) => {
                         for i in 0..duration_frames {
                            let mut frame_samples = Vec::with_capacity(channels);
                            let mut sum = 0.0;
                            for c in 0..channels { 
                                let s = (buf.chan(c)[i] as f32) / 32768.0;
                                frame_samples.push(s);
                                sum += s; 
                            }
                            loudness_meter.process(&frame_samples);

                            let val = sum / channels as f32;
                            if phase == 0 && head_pcm.len() < key_max_samples {
                                head_pcm.push(val);
                            }
                            let high = hpf.process(val);
                            current_sum_sq += val * val;
                            let low = lpf.process(val);
                            current_low_sum_sq += low * low;
                            current_high_sum_sq += high * high;
                            current_count += 1;
                            if current_count >= window_size {
                                let rms = (current_sum_sq / window_size as f32).sqrt();
                                let rms_low = (current_low_sum_sq / window_size as f32).sqrt();
                                let rms_high = (current_high_sum_sq / window_size as f32).sqrt();
                                temp_envelope.push(rms);
                                temp_low_envelope.push(rms_low);
                                let ratio = if rms > 0.0001 { rms_high / rms } else { 0.0 };
                                temp_vocal.push(ratio);
                                current_sum_sq = 0.0;
                                current_low_sum_sq = 0.0;
                                current_high_sum_sq = 0.0;
                                current_count = 0;
                            }
                        }
                    }
                    AudioBufferRef::S24(buf) => {
                        for i in 0..duration_frames {
                           let mut frame_samples = Vec::with_capacity(channels);
                           let mut sum = 0.0;
                           for c in 0..channels { 
                               let s = (buf.chan(c)[i].0 as f32) / 8388608.0;
                               frame_samples.push(s);
                               sum += s; 
                           }
                           loudness_meter.process(&frame_samples);

                           let val = sum / channels as f32;
                           if phase == 0 && head_pcm.len() < key_max_samples {
                               head_pcm.push(val);
                           }
                           let high = hpf.process(val);
                           current_sum_sq += val * val;
                           let low = lpf.process(val);
                           current_low_sum_sq += low * low;
                           current_high_sum_sq += high * high;
                           current_count += 1;
                           if current_count >= window_size {
                                let rms = (current_sum_sq / window_size as f32).sqrt();
                                let rms_low = (current_low_sum_sq / window_size as f32).sqrt();
                                let rms_high = (current_high_sum_sq / window_size as f32).sqrt();
                                temp_envelope.push(rms);
                                temp_low_envelope.push(rms_low);
                                let ratio = if rms > 0.0001 { rms_high / rms } else { 0.0 };
                                temp_vocal.push(ratio);
                                current_sum_sq = 0.0;
                                current_low_sum_sq = 0.0;
                                current_high_sum_sq = 0.0;
                                current_count = 0;
                           }
                       }
                   }
                   AudioBufferRef::S32(buf) => {
                        for i in 0..duration_frames {
                           let mut frame_samples = Vec::with_capacity(channels);
                           let mut sum = 0.0;
                           for c in 0..channels { 
                               let s = (buf.chan(c)[i] as f32) / 2147483648.0;
                               frame_samples.push(s);
                               sum += s; 
                           }
                           loudness_meter.process(&frame_samples);

                           let val = sum / channels as f32;
                           if phase == 0 && head_pcm.len() < key_max_samples {
                               head_pcm.push(val);
                           }
                           let high = hpf.process(val);
                           current_sum_sq += val * val;
                           let low = lpf.process(val);
                           current_low_sum_sq += low * low;
                           current_high_sum_sq += high * high;
                           current_count += 1;
                           if current_count >= window_size {
                                let rms = (current_sum_sq / window_size as f32).sqrt();
                                let rms_low = (current_low_sum_sq / window_size as f32).sqrt();
                                let rms_high = (current_high_sum_sq / window_size as f32).sqrt();
                                temp_envelope.push(rms);
                                temp_low_envelope.push(rms_low);
                                let ratio = if rms > 0.0001 { rms_high / rms } else { 0.0 };
                                temp_vocal.push(ratio);
                                current_sum_sq = 0.0;
                                current_low_sum_sq = 0.0;
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
        let rms_low = (current_low_sum_sq / window_size as f32).sqrt();
        let rms_high = (current_high_sum_sq / window_size as f32).sqrt();
        temp_envelope.push(rms);
        temp_low_envelope.push(rms_low);
        let ratio = if rms > 0.0001 { rms_high / rms } else { 0.0 };
        temp_vocal.push(ratio);
    }
    
    // Distribute temp buffer based on phase
    if phase == 0 {
        head_envelope.append(&mut temp_envelope);
        head_low_envelope.append(&mut temp_low_envelope);
        head_vocal_ratio.append(&mut temp_vocal);
        // If we never seeked, head is full
        if full_envelope.is_empty() {
            full_envelope = head_envelope.clone();
            full_low_envelope = head_low_envelope.clone();
        }
    } else {
        tail_envelope.append(&mut temp_envelope);
        tail_low_envelope.append(&mut temp_low_envelope);
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
    let (bpm, bpm_conf, first_beat) = detect_bpm_from_envelope(&full_envelope, &full_low_envelope, env_rate);
    
    // 3. Drop/Chorus Detection (Energy Surge)
    let drop_pos = detect_drop_pos(&head_envelope, env_rate);

    // 4. Smart Cut (Vocal / Activity)
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
    
    // Detect Vocal Out & Last Vocal In (in Tail or Head)
    let mut vocal_out = None;
    let mut vocal_last_in = None;
    let target_env = if !tail_envelope.is_empty() { &tail_envelope } else { &head_envelope };
    let target_ratio = if !tail_vocal_ratio.is_empty() { &tail_vocal_ratio } else { &head_vocal_ratio };
    
    // Scan backwards for the last significant vocal segment (> 2s)
    let min_vocal_frames = 100; // 2s * 50Hz
    let mut i = target_env.len().saturating_sub(1);
    
    while i > 0 {
        if is_vocal(target_env[i], target_ratio[i]) {
            let end_idx = i;
            let mut start_idx = i;
            // Trace back to find start of this segment
            while start_idx > 0 && is_vocal(target_env[start_idx], target_ratio[start_idx]) {
                start_idx -= 1;
            }
            
            // Check length
            if end_idx - start_idx >= min_vocal_frames {
                // Found valid segment
                let out_time = end_idx as f64 / env_rate;
                let in_time = start_idx as f64 / env_rate;
                
                if !tail_envelope.is_empty() {
                    let tail_len_sec = tail_envelope.len() as f64 / env_rate;
                    vocal_out = Some(duration - (tail_len_sec - out_time));
                    vocal_last_in = Some(duration - (tail_len_sec - in_time));
                } else {
                    vocal_out = Some(out_time);
                    vocal_last_in = Some(in_time);
                }
                break;
            } else {
                // Too short (ad-lib/noise), skip this segment
                i = start_idx;
                if i > 0 { i -= 1; }
                continue;
            }
        }
        if i == 0 { break; }
        i -= 1;
    }
    
    // Fallback: if no long segment found, use original logic to just find "last vocal point"
    if vocal_out.is_none() {
         for (idx, (&rms, &ratio)) in target_env.iter().zip(target_ratio.iter()).enumerate().rev() {
            if is_vocal(rms, ratio) {
                 let start = idx.saturating_sub(5);
                 if (start..=idx).all(|j| is_vocal(target_env[j], target_ratio[j])) {
                     let local_time = idx as f64 / env_rate;
                     if !tail_envelope.is_empty() {
                          vocal_out = Some(duration - (tail_envelope.len() as f64 / env_rate - local_time));
                     } else {
                          vocal_out = Some(local_time);
                     }
                     // No vocal_last_in in fallback
                     break;
                 }
            }
        }
    }
    
    // 5. Outro Energy
    let outro_energy_level = if !tail_envelope.is_empty() {
        let (_, local_out_time) = detect_silence_from_envelope(&tail_envelope, env_rate, -48.0);
        let end_idx = (local_out_time * env_rate) as usize;
        let end_idx = end_idx.min(tail_envelope.len());
        let start_idx = end_idx.saturating_sub(500); // 10s * 50Hz
        
        if end_idx > start_idx {
            let slice = &tail_envelope[start_idx..end_idx];
            let sum_sq: f32 = slice.iter().map(|&x| x * x).sum();
            let mean_sq = sum_sq / slice.len() as f32;
            if mean_sq > 0.0 {
                Some((20.0 * mean_sq.sqrt().log10()) as f64)
            } else {
                Some(-70.0)
            }
        } else {
            None
        }
    } else {
        None
    };

    // 6. Synthesize Smart Cut Points
    
    // Cut Out Logic
    let smart_cut_out = if let (Some(v_out), Some(bpm_val), Some(f_beat)) = (vocal_out, bpm, first_beat) {
        let beat_len = 60.0 / bpm_val;
        // 增加缓冲：给 8 拍 (2小节) 的缓冲，让人声完全结束后的器乐段展示出来
        let buffer_beats = 8.0; 
        let potential_cut = v_out + (beat_len * buffer_beats);
        
        let confidence = bpm_conf.unwrap_or(0.0);
        // 使用 Ceil 模式：必须在 potential_cut 之后的小节线
        let quantized_cut = snap_to_bar(potential_cut, bpm_val, f_beat, confidence, SnapMode::Ceil);
        
        // 确保不晚于 fade_out
        if quantized_cut < (fade_out - 0.5) {
            Some(quantized_cut)
        } else {
            Some((fade_out - 5.0).max(0.0))
        }
    } else {
        // Fallback: 倒数 15秒 (作为长混音的基准)
        // 但不能早于 fade_in
        let default_cut = (duration - 15.0).max(fade_in + 10.0);
        Some(default_cut.min(fade_out - 5.0).max(0.0))
    };
    
    // Cut In Logic (Back-Calculation)
    let smart_cut_in = if let (Some(bpm_val), Some(f_beat)) = (bpm, first_beat) {
        let confidence = bpm_conf.unwrap_or(0.0);
        
        if confidence > 0.4 {
            let beat_len = 60.0 / bpm_val;
            
            // 目标锚点：优先找人声进入点，其次找 Drop 点
            let target_anchor = if let Some(v_in) = vocal_in {
                Some(v_in)
            } else if let Some(d_pos) = drop_pos {
                Some(d_pos)
            } else {
                None
            };

            if let Some(anchor) = target_anchor {
                // 计算从第一拍到锚点的距离
                let intro_len = anchor - f_beat;
                
                // 倒推步长：8 小节 (32拍)
                let bars_8_duration = beat_len * 32.0;
                let bars_4_duration = beat_len * 16.0;
                
                let raw_cut_in = if intro_len >= bars_8_duration {
                    anchor - bars_8_duration
                } else if intro_len >= bars_4_duration {
                    anchor - bars_4_duration
                } else {
                    f_beat
                };

                // 使用 Floor 模式：确保切入点在计算出的 raw_cut_in 之前最近的一个小节线
                let snapped_in = snap_to_bar(raw_cut_in, bpm_val, f_beat, confidence, SnapMode::Floor);
                
                Some(snapped_in.max(fade_in))
            } else {
                Some(f_beat)
            }
        } else {
            Some(fade_in)
        }
    } else {
        Some(fade_in)
    };

    let loudness = loudness_meter.get_lufs();
    let (key_root, key_mode, key_confidence) = detect_key_from_pcm(&head_pcm, sample_rate);

    Some(AudioAnalysis {
        duration,
        bpm,
        bpm_confidence: bpm_conf,
        fade_in_pos: fade_in,
        fade_out_pos: fade_out,
        first_beat_pos: first_beat,
        loudness: Some(loudness),
        drop_pos,
        version: 8,
        analyze_window: max_time,
        cut_in_pos: smart_cut_in,
        cut_out_pos: smart_cut_out,
        vocal_in_pos: vocal_in,
        vocal_out_pos: vocal_out,
        vocal_last_in_pos: vocal_last_in,
        outro_energy_level,
        key_root,
        key_mode,
        key_confidence,
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

fn detect_bpm_from_envelope(envelope: &[f32], low_envelope: &[f32], rate: f64) -> (Option<f64>, Option<f64>, Option<f64>) {
    let len = envelope.len().min(low_envelope.len());
    if len < 100 { return (None, None, None); }
    
    // Compute flux (Spectral Flux approximation using envelope difference)
    // Half-wave rectification
    let mut flux_full = Vec::with_capacity(len);
    let mut flux_low = Vec::with_capacity(len);
    flux_full.push(0.0);
    flux_low.push(0.0);
    for i in 1..len {
        let diff_full = envelope[i] - envelope[i-1];
        flux_full.push(if diff_full > 0.0 { diff_full } else { 0.0 });
        let diff_low = low_envelope[i] - low_envelope[i-1];
        flux_low.push(if diff_low > 0.0 { diff_low } else { 0.0 });
    }
    
    // Autocorrelation
    // Rate 50Hz.
    // 60 BPM = 1s = 50 samples
    // 180 BPM = 0.33s = 16.6 samples
    let min_lag = 15;
    let max_lag = 55;
    
    if flux_full.len() < max_lag * 2 { return (None, None, None); }
    
    let mut correlations = Vec::new();
    
    for lag in min_lag..=max_lag {
        let mut corr = 0.0;
        let start_idx = 0;
        let end_idx = flux_full.len() - lag;
        // Step by 1 for better accuracy on envelope
        for i in start_idx..end_idx { 
            corr += flux_full[i] * flux_full[i+lag];
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
    
    // First Beat Detection
    // Find a phase that maximizes energy on the BPM (and 4-beat) grid
    let mut first_beat = None;
    if confidence > 0.2 {
        let lag = best_lag as usize;
        let search_len = ((10.0 * rate) as usize).min(flux_full.len());
        if lag > 0 && search_len > lag {
            let mut best_phase_bar = 0usize;
            let mut best_energy_bar = -1.0f32;
            let mut sum_energy_bar = 0.0f32;
            let bar_stride = lag.saturating_mul(4);
            if bar_stride > 0 && search_len > bar_stride {
                for phase in 0..lag {
                    let mut energy = 0.0f32;
                    let mut idx = phase;
                    while idx < search_len {
                        energy += flux_low[idx];
                        match idx.checked_add(bar_stride) {
                            Some(next) => idx = next,
                            None => break,
                        }
                    }
                    sum_energy_bar += energy;
                    if energy > best_energy_bar {
                        best_energy_bar = energy;
                        best_phase_bar = phase;
                    }
                }
            }

            let mut best_phase_beat = 0usize;
            let mut best_energy_beat = -1.0f32;
            let mut sum_energy_beat = 0.0f32;
            for phase in 0..lag {
                let mut energy = 0.0f32;
                let mut idx = phase;
                while idx < search_len {
                    energy += flux_full[idx];
                    match idx.checked_add(lag) {
                        Some(next) => idx = next,
                        None => break,
                    }
                }
                sum_energy_beat += energy;
                if energy > best_energy_beat {
                    best_energy_beat = energy;
                    best_phase_beat = phase;
                }
            }

            let avg_energy_beat = sum_energy_beat / lag as f32;
            let beat_ok = best_energy_beat > 0.02 && best_energy_beat >= avg_energy_beat * 1.15;

            let bar_ok = if bar_stride > 0 && search_len > bar_stride {
                let avg_energy_bar = sum_energy_bar / lag as f32;
                best_energy_bar > 0.02 && best_energy_bar >= avg_energy_bar * 1.15
            } else {
                false
            };

            let best_phase = if bar_ok { best_phase_bar } else { best_phase_beat };
            if bar_ok || beat_ok {
                first_beat = Some(best_phase as f64 / rate);
            }
        }
    }

    (Some(bpm), Some(confidence), first_beat)
}

fn detect_key_from_pcm(pcm: &[f32], sample_rate: u32) -> (Option<i32>, Option<i32>, Option<f64>) {
    let frame_size = 4096usize;
    let hop_size = 1024usize;
    if pcm.len() < frame_size { return (None, None, None); }
    if sample_rate == 0 { return (None, None, None); }

    let sr = sample_rate as f32;
    let min_hz = 80.0f32;
    let max_hz = 5000.0f32;

    let mut window = vec![0.0f32; frame_size];
    let denom = (frame_size - 1) as f32;
    for (i, w) in window.iter_mut().enumerate() {
        *w = 0.5 - 0.5 * (2.0 * std::f32::consts::PI * (i as f32) / denom).cos();
    }

    let half = frame_size / 2;
    let mut bin_to_pc: Vec<Option<usize>> = vec![None; half];
    let bin_hz_scale = sr / (frame_size as f32);
    for bin in 1..half {
        let hz = (bin as f32) * bin_hz_scale;
        if hz < min_hz || hz > max_hz { continue; }
        let midi = 69.0 + 12.0 * ((hz / 440.0).ln() / std::f32::consts::LN_2);
        let pc = (midi.round() as i32).rem_euclid(12) as usize;
        bin_to_pc[bin] = Some(pc);
    }

    let mut planner = FftPlanner::<f32>::new();
    let fft = planner.plan_fft_forward(frame_size);
    let mut buffer = vec![Complex32::new(0.0, 0.0); frame_size];

    let mut chroma = [0.0f32; 12];
    let mut start = 0usize;
    while start + frame_size <= pcm.len() {
        for i in 0..frame_size {
            buffer[i] = Complex32::new(pcm[start + i] * window[i], 0.0);
        }
        fft.process(&mut buffer);

        for bin in 1..half {
            let Some(pc) = bin_to_pc[bin] else { continue; };
            let c = buffer[bin];
            let mag2 = c.re * c.re + c.im * c.im;
            chroma[pc] += mag2;
        }

        start += hop_size;
    }

    let mut chroma_l2 = 0.0f32;
    for v in chroma.iter() {
        chroma_l2 += *v * *v;
    }
    if chroma_l2 <= 0.0 { return (None, None, None); }
    let chroma_l2 = chroma_l2.sqrt();
    let mut chroma_norm = [0.0f32; 12];
    for (i, v) in chroma.iter().enumerate() {
        chroma_norm[i] = *v / chroma_l2;
    }

    let major = [6.35f32, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
    let minor = [6.33f32, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

    let mut major_l2 = 0.0f32;
    let mut minor_l2 = 0.0f32;
    for i in 0..12 {
        major_l2 += major[i] * major[i];
        minor_l2 += minor[i] * minor[i];
    }
    let major_l2 = major_l2.sqrt();
    let minor_l2 = minor_l2.sqrt();

    let mut best_score = -1.0f32;
    let mut second_score = -1.0f32;
    let mut best_root = 0i32;
    let mut best_mode = 0i32;

    for root in 0..12usize {
        let mut score_major = 0.0f32;
        let mut score_minor = 0.0f32;
        for i in 0..12usize {
            let t_major = major[(i + 12 - root) % 12] / major_l2;
            let t_minor = minor[(i + 12 - root) % 12] / minor_l2;
            score_major += chroma_norm[i] * t_major;
            score_minor += chroma_norm[i] * t_minor;
        }

        if score_major > best_score {
            second_score = best_score;
            best_score = score_major;
            best_root = root as i32;
            best_mode = 0;
        } else if score_major > second_score {
            second_score = score_major;
        }

        if score_minor > best_score {
            second_score = best_score;
            best_score = score_minor;
            best_root = root as i32;
            best_mode = 1;
        } else if score_minor > second_score {
            second_score = score_minor;
        }
    }

    if best_score <= 0.0 { return (None, None, None); }
    let confidence = ((best_score - second_score) / best_score).clamp(0.0, 1.0) as f64;
    if confidence < 0.05 { return (None, None, None); }

    (Some(best_root), Some(best_mode), Some(confidence))
}

fn detect_drop_pos(envelope: &[f32], rate: f64) -> Option<f64> {
    // Detect energy surge (Drop / Chorus)
    // Sliding window average energy
    let window_len = (2.0 * rate) as usize; // 2 seconds
    if envelope.len() < window_len * 2 { return None; }
    
    let mut max_diff = 0.0;
    let mut drop_idx = 0;
    
    // Calculate moving average
    // We look for a point where Avg(Current 2s) >> Avg(Previous 4s)
    
    for i in (rate as usize * 4)..envelope.len() - window_len {
        // Prev 4s average
        let prev_len = (rate * 4.0) as usize;
        let prev_sum: f32 = envelope[i-prev_len..i].iter().sum();
        let prev_avg = prev_sum / prev_len as f32;
        
        // Next 2s average
        let next_sum: f32 = envelope[i..i+window_len].iter().sum();
        let next_avg = next_sum / window_len as f32;
        
        if prev_avg > 0.001 {
            let ratio = next_avg / prev_avg;
            if ratio > max_diff {
                max_diff = ratio;
                drop_idx = i;
            }
        }
    }
    
    if max_diff > 1.5 { // 50% energy increase
        Some(drop_idx as f64 / rate)
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::detect_key_from_pcm;

    fn gen_chord(sample_rate: u32, seconds: f32, freqs: &[f32]) -> Vec<f32> {
        let len = (sample_rate as f32 * seconds) as usize;
        let mut out = vec![0.0f32; len];
        let sr = sample_rate as f32;
        for i in 0..len {
            let t = i as f32 / sr;
            let mut v = 0.0f32;
            for &f in freqs {
                v += (2.0 * std::f32::consts::PI * f * t).sin();
            }
            out[i] = v / freqs.len() as f32;
        }
        out
    }

    #[test]
    fn detects_c_major_chord() {
        let sr = 44_100;
        let pcm = gen_chord(sr, 2.0, &[261.63, 329.63, 392.00]);
        let (root, mode, conf) = detect_key_from_pcm(&pcm, sr);
        assert_eq!(root, Some(0));
        assert_eq!(mode, Some(0));
        assert!(conf.unwrap_or(0.0) > 0.05);
    }

    #[test]
    fn detects_a_minor_chord() {
        let sr = 44_100;
        let pcm = gen_chord(sr, 2.0, &[220.00, 261.63, 329.63]);
        let (root, mode, conf) = detect_key_from_pcm(&pcm, sr);
        assert_eq!(root, Some(9));
        assert_eq!(mode, Some(1));
        assert!(conf.unwrap_or(0.0) > 0.05);
    }
}
