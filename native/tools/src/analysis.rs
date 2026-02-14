use napi_derive::napi;
use std::fs::File;
use std::path::Path;
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
    pub fade_in_pos: f64,
    pub fade_out_pos: f64,
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
    
    // Extract metadata and create decoder in a separate block to drop the immutable borrow of `format`
    let (track_id, time_base, n_frames, mut decoder) = {
        let track = format.default_track()?;
        let track_id = track.id;
        let time_base = track.codec_params.time_base;
        let n_frames = track.codec_params.n_frames;

        let dec_opts: DecoderOptions = Default::default();
        let decoder = symphonia::default::get_codecs()
            .make(&track.codec_params, &dec_opts)
            .ok()?;
            
        (track_id, time_base, n_frames, decoder)
    };

    let mut duration = 0.0;
    if let Some(n_frames) = n_frames {
        if let Some(tb) = time_base {
            duration = tb.calc_time(n_frames).seconds as f64 + tb.calc_time(n_frames).frac;
        }
    }

    // Silence detection
    let mut first_sound_ts: Option<f64> = None;
    let mut last_sound_ts: Option<f64> = None;

    // To speed up, we might process in chunks or handle errors gracefully
    loop {
        let packet = match format.next_packet() {
            Ok(packet) => packet,
            Err(Error::IoError(_)) => break, // End of stream
            Err(Error::ResetRequired) => {
                // The track list has been changed. Re-examine it and create a new decoder instance.
                break;
            }
            Err(_) => break, // Other errors
        };

        if packet.track_id() != track_id {
            continue;
        }

        match decoder.decode(&packet) {
            Ok(decoded) => {
                let spec = *decoded.spec();
                let channels = spec.channels.count();
                
                // Get timestamp of this packet
                let ts = if let Some(tb) = time_base {
                     let time = tb.calc_time(packet.ts());
                     time.seconds as f64 + time.frac
                } else {
                    0.0
                };

                if channels > 0 {
                     last_sound_ts = Some(ts);
                     if first_sound_ts.is_none() {
                         first_sound_ts = Some(ts);
                     }
                }
            }
            Err(Error::DecodeError(_)) => (),
            Err(_) => break,
        }
    }
    
    // Fallback if we couldn't scan
    let computed_duration = last_sound_ts.unwrap_or(duration);
    
    Some(AudioAnalysis {
        duration: computed_duration,
        bpm: None,
        fade_in_pos: first_sound_ts.unwrap_or(0.0),
        fade_out_pos: computed_duration,
    })
}
