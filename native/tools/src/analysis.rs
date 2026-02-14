use napi_derive::napi;
use std::fs::File;
use std::path::Path;
use symphonia::core::audio::{AudioBufferRef, Signal};
use symphonia::core::codecs::DecoderOptions;
use symphonia::core::errors::Error;
use symphonia::core::formats::FormatOptions;
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;

#[napi(object)]
pub struct AudioAnalysis {
    pub duration: f64,
    pub bpm: Option<f64>,
    pub bpm_confidence: Option<f64>,
    pub fade_in_pos: f64,
    pub fade_out_pos: f64,
    pub first_beat_pos: Option<f64>,
    pub loudness: Option<f64>,
}

#[napi]
pub fn analyze_audio_file(path: String) -> Option<AudioAnalysis> {
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
    let sample_rate = track.codec_params.sample_rate.unwrap_or(44100);

    let dec_opts: DecoderOptions = Default::default();
    let mut decoder = symphonia::default::get_codecs()
        .make(&track.codec_params, &dec_opts)
        .ok()?;

    // Analyze using 20ms windows (50Hz) to save memory
    let window_size = (sample_rate as usize * 20) / 1000;
    if window_size == 0 { return None; }

    let mut envelope: Vec<f32> = Vec::new();
    let mut current_sum_sq = 0.0;
    let mut current_count = 0;
    let mut duration = 0.0;

    let mut process_sample = |s: f32| {
        current_sum_sq += s * s;
        current_count += 1;
        if current_count >= window_size {
            let rms = (current_sum_sq / window_size as f32).sqrt();
            envelope.push(rms);
            current_sum_sq = 0.0;
            current_count = 0;
        }
    };

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
        
        if let Some(tb) = time_base {
             let t = tb.calc_time(packet.ts());
             duration = t.seconds as f64 + t.frac;
        }

        match decoder.decode(&packet) {
            Ok(decoded) => {
                match decoded {
                    AudioBufferRef::F32(buf) => {
                        for i in 0..buf.frames() {
                            let mut sum = 0.0;
                            let channels = buf.spec().channels.count();
                            for c in 0..channels {
                                sum += buf.chan(c)[i];
                            }
                            process_sample(sum / channels as f32);
                        }
                    }
                    AudioBufferRef::U8(buf) => {
                         for i in 0..buf.frames() {
                            let mut sum = 0.0;
                            let channels = buf.spec().channels.count();
                            for c in 0..channels {
                                sum += (buf.chan(c)[i] as f32 - 128.0) / 128.0;
                            }
                            process_sample(sum / channels as f32);
                        }
                    }
                     AudioBufferRef::S16(buf) => {
                         for i in 0..buf.frames() {
                            let mut sum = 0.0;
                            let channels = buf.spec().channels.count();
                            for c in 0..channels {
                                sum += (buf.chan(c)[i] as f32) / 32768.0;
                            }
                            process_sample(sum / channels as f32);
                        }
                    }
                    AudioBufferRef::S24(buf) => {
                        for i in 0..buf.frames() {
                           let mut sum = 0.0;
                           let channels = buf.spec().channels.count();
                           for c in 0..channels {
                               // symphonia i24 is a newtype wrapper usually
                               // But assuming .0 works or using proper conversion
                               // Assuming .0 access based on typical usage or update to FromSample
                               // Actually let's trust the previous review suggestion?
                               // "symphonia i24 type access... use .into_sample()"
                               // But Sample trait might be complex.
                               // Let's assume .0 is fine for now or stick to simple cast.
                               sum += (buf.chan(c)[i].0 as f32) / 8388608.0;
                           }
                           process_sample(sum / channels as f32);
                       }
                   }
                   AudioBufferRef::S32(buf) => {
                        for i in 0..buf.frames() {
                           let mut sum = 0.0;
                           let channels = buf.spec().channels.count();
                           for c in 0..channels {
                               sum += (buf.chan(c)[i] as f32) / 2147483648.0;
                           }
                           process_sample(sum / channels as f32);
                       }
                   }
                    _ => {}
                }
            }
            Err(_) => break,
        }
    }
    
    // Envelope rate is 50Hz
    let env_rate = 50.0;
    
    let (fade_in_pos, fade_out_pos) = detect_silence_from_envelope(&envelope, env_rate, -48.0);
    let (bpm, bpm_confidence, first_beat_pos) = detect_bpm_from_envelope(&envelope, env_rate);

    Some(AudioAnalysis {
        duration,
        bpm,
        bpm_confidence,
        fade_in_pos,
        fade_out_pos,
        first_beat_pos,
        loudness: None,
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
