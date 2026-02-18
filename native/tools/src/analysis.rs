use napi_derive::napi;
use num_complex::Complex32;
use rustfft::FftPlanner;
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
    #[napi(js_name = "mix_center_pos")]
    pub mix_center_pos: f64,
    #[napi(js_name = "mix_start_pos")]
    pub mix_start_pos: f64,
    #[napi(js_name = "mix_end_pos")]
    pub mix_end_pos: f64,
    #[napi(js_name = "energy_profile")]
    pub energy_profile: Vec<f64>,
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
    #[napi(js_name = "camelot_key")]
    pub camelot_key: Option<String>,
}

#[napi(object)]
pub struct TransitionProposal {
    pub duration: f64,
    #[napi(js_name = "current_track_mix_out")]
    pub current_track_mix_out: f64,
    #[napi(js_name = "next_track_mix_in")]
    pub next_track_mix_in: f64,
    #[napi(js_name = "mix_type")]
    pub mix_type: String,
    #[napi(js_name = "filter_strategy")]
    pub filter_strategy: String,
    #[napi(js_name = "compatibility_score")]
    pub compatibility_score: f64,
    #[napi(js_name = "key_compatible")]
    pub key_compatible: bool,
    #[napi(js_name = "bpm_compatible")]
    pub bpm_compatible: bool,
}

fn get_camelot_key(root: i32, mode: i32) -> Option<String> {
    if !(0..=11).contains(&root) {
        return None;
    }

    let key_map_mode_0 = [12, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5];
    let key_map_mode_1 = [9, 4, 11, 6, 1, 8, 3, 10, 5, 12, 7, 2];
    let key_num = match mode {
        0 => *key_map_mode_0.get(root as usize)?,
        1 => *key_map_mode_1.get(root as usize)?,
        _ => return None,
    };

    let letter = if mode == 0 { "B" } else { "A" };
    Some(format!("{}{}", key_num, letter))
}

fn parse_camelot(key: &str) -> Option<(i32, char)> {
    let s = key.trim();
    if s.len() < 2 {
        return None;
    }
    let mut chars = s.chars();
    let mode = chars.next_back()?;
    let mode = mode.to_ascii_uppercase();
    if mode != 'A' && mode != 'B' {
        return None;
    }
    let num_str = chars.as_str().trim();
    let num = num_str.parse::<i32>().ok()?;
    if !(1..=12).contains(&num) {
        return None;
    }
    Some((num, mode))
}

fn is_camelot_compatible(key_a: &str, key_b: &str) -> bool {
    if key_a == key_b {
        return true;
    }
    let Some((num_a, mode_a)) = parse_camelot(key_a) else {
        return false;
    };
    let Some((num_b, mode_b)) = parse_camelot(key_b) else {
        return false;
    };

    if num_a == num_b {
        return true;
    }

    let diff = (num_a - num_b).abs();
    let is_neighbor = diff == 1 || diff == 11;
    is_neighbor && mode_a == mode_b
}

fn snap_to_bar_floor(time: f64, bpm: f64, first_beat: f64, confidence: f64) -> f64 {
    if bpm <= 0.0 || confidence < 0.4 {
        return time;
    }

    let seconds_per_beat = 60.0 / bpm;
    let seconds_per_bar = seconds_per_beat * 4.0; // Assume 4/4

    // Calculate how many bars from first_beat
    let mut raw_bars = (time - first_beat) / seconds_per_bar;
    if seconds_per_bar.is_finite() && seconds_per_bar > 0.0 && raw_bars.is_finite() {
        let epsilon_sec = 0.05;
        let eps_bars = epsilon_sec / seconds_per_bar;
        if eps_bars.is_finite() && eps_bars > 0.0 {
            let nearest = raw_bars.round();
            if (raw_bars - nearest).abs() < eps_bars {
                raw_bars = nearest;
            }
        }
    }

    let bars_count = raw_bars.floor();

    // Return snapped time
    let res = first_beat + (bars_count * seconds_per_bar);
    if res < 0.0 {
        first_beat
    } else {
        res
    }
}

fn snap_to_phrase_floor(
    time: f64,
    bpm: f64,
    first_beat: f64,
    confidence: f64,
    beats_per_phrase: f64,
) -> f64 {
    if bpm <= 0.0 || confidence < 0.4 || beats_per_phrase <= 0.0 {
        return time;
    }

    let seconds_per_beat = 60.0 / bpm;
    let phrase_seconds = seconds_per_beat * beats_per_phrase;
    if !phrase_seconds.is_finite() || phrase_seconds <= 0.0 {
        return time;
    }

    let mut raw_phrases = (time - first_beat) / phrase_seconds;
    if phrase_seconds.is_finite() && phrase_seconds > 0.0 && raw_phrases.is_finite() {
        let epsilon_sec = 0.05;
        let eps_phrases = epsilon_sec / phrase_seconds;
        if eps_phrases.is_finite() && eps_phrases > 0.0 {
            let nearest = raw_phrases.round();
            if (raw_phrases - nearest).abs() < eps_phrases {
                raw_phrases = nearest;
            }
        }
    }

    let phrases_count = raw_phrases.floor();

    let res = first_beat + (phrases_count * phrase_seconds);
    if res < 0.0 {
        first_beat
    } else {
        res
    }
}

fn snap_cut_out_floor(
    raw_target: f64,
    bpm: f64,
    first_beat: f64,
    confidence: f64,
    max_pos: f64,
) -> f64 {
    let phrase_cut = snap_to_phrase_floor(raw_target, bpm, first_beat, confidence, 16.0);
    let mut snapped = if phrase_cut.is_finite() && phrase_cut <= max_pos {
        phrase_cut
    } else {
        snap_to_bar_floor(raw_target, bpm, first_beat, confidence)
    };

    if !snapped.is_finite() {
        snapped = raw_target;
    }

    snapped.min(max_pos).max(0.0)
}

fn find_best_phrase_start(
    anchor: f64,
    bpm: f64,
    first_beat: f64,
    fade_in: f64,
    confidence: f64,
) -> f64 {
    if bpm <= 0.0 || confidence < 0.4 {
        return fade_in;
    }

    let seconds_per_beat = 60.0 / bpm;
    let seconds_per_bar = seconds_per_beat * 4.0;
    if !seconds_per_bar.is_finite() || seconds_per_bar <= 0.0 {
        return first_beat.max(fade_in);
    }

    let candidate_lengths = [32.0, 16.0, 8.0, 4.0];
    for &bars in candidate_lengths.iter() {
        let duration = bars * seconds_per_bar;
        let raw_start = anchor - duration;
        if raw_start > (fade_in + seconds_per_bar) {
            let snapped_start = snap_to_bar_floor(raw_start, bpm, first_beat, confidence);
            if snapped_start.is_finite() && snapped_start >= fade_in {
                return snapped_start;
            }
        }
    }

    first_beat.max(fade_in)
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
        Self {
            prev_x: 0.0,
            prev_y: 0.0,
            alpha,
        }
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

struct VocalFilter {
    lpf: LowPassFilter,
    hpf: HighPassFilter,
}

impl VocalFilter {
    fn new(sample_rate: u32) -> Self {
        Self {
            lpf: LowPassFilter::new(sample_rate, 3000.0),
            hpf: HighPassFilter::new(sample_rate, 200.0),
        }
    }

    fn process(&mut self, x: f32) -> f32 {
        let low_cut = self.hpf.process(x);
        self.lpf.process(low_cut)
    }
}

// Biquad for K-weighting
struct BiquadFilter {
    b0: f64,
    b1: f64,
    b2: f64,
    a1: f64,
    a2: f64,
    z1: f64,
    z2: f64,
}

impl BiquadFilter {
    fn new(b0: f64, b1: f64, b2: f64, a1: f64, a2: f64) -> Self {
        Self {
            b0,
            b1,
            b2,
            a1,
            a2,
            z1: 0.0,
            z2: 0.0,
        }
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
            (
                1.53512485958697,
                -2.69169618940638,
                1.19839281085285,
                -1.69065929318241,
                0.73248077421585,
            )
        } else {
            // Fallback or different coeffs for lower rates.
            // Using same for now as we mostly deal with 44.1/48 music.
            (
                1.53512485958697,
                -2.69169618940638,
                1.19839281085285,
                -1.69065929318241,
                0.73248077421585,
            )
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
            if i >= self.pre_filter.len() {
                break;
            }
            let s = sample as f64;
            let s1 = self.pre_filter[i].process(s);
            let s2 = self.rlb_filter[i].process(s1);
            self.sum_sq += s2 * s2;
        }
        self.count += 1;
    }

    fn get_lufs(&self) -> f64 {
        if self.count == 0 {
            return -70.0;
        }
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

        if mean_sq <= 0.0 {
            return -70.0;
        }

        let lufs = -0.691 + 10.0 * mean_sq.log10();
        lufs
    }
}

fn internal_analyze_impl(
    path: &str,
    max_analyze_time: Option<f64>,
    include_tail: bool,
) -> Option<AudioAnalysis> {
    let path = Path::new(path);
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
    let total_duration = match (n_frames, time_base) {
        (Some(n), Some(tb)) => {
            let t = tb.calc_time(n);
            Some(t.seconds as f64 + t.frac)
        }
        _ => None,
    };

    let dec_opts: DecoderOptions = Default::default();
    let mut decoder = symphonia::default::get_codecs()
        .make(&track.codec_params, &dec_opts)
        .ok()?;

    // Analysis params
    let max_time = max_analyze_time.unwrap_or(60.0).clamp(5.0, 300.0);
    let window_size = (sample_rate as usize * 20) / 1000; // 20ms
    if window_size == 0 {
        return None;
    }
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
    let mut current_vocal_sum_sq = 0.0;
    let mut current_count = 0;
    let mut duration = 0.0;

    let mut vocal_filter = VocalFilter::new(sample_rate);
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

                if !include_tail {
                    break;
                }

                if let Some(tot) = total_duration {
                    if tot > max_time * 2.0 {
                        // We can seek to tot - max_time
                        let seek_time = tot - max_time;
                        let seek_ts = Time::from(seek_time);

                        match format.seek(
                            SeekMode::Accurate,
                            SeekTo::Time {
                                time: seek_ts,
                                track_id: Some(track_id),
                            },
                        ) {
                            Ok(_) => {
                                phase = 1;
                                _seek_done = true;
                                // Reset filters/state
                                current_sum_sq = 0.0;
                                current_low_sum_sq = 0.0;
                                current_vocal_sum_sq = 0.0;
                                current_count = 0;
                                vocal_filter = VocalFilter::new(sample_rate);
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
                            let vocal = vocal_filter.process(val);
                            let low = lpf.process(val);

                            current_sum_sq += val * val;
                            current_low_sum_sq += low * low;
                            current_vocal_sum_sq += vocal * vocal;
                            current_count += 1;

                            if current_count >= window_size {
                                let rms = (current_sum_sq / window_size as f32).sqrt();
                                let rms_low = (current_low_sum_sq / window_size as f32).sqrt();
                                let rms_vocal = (current_vocal_sum_sq / window_size as f32).sqrt();
                                temp_envelope.push(rms);
                                temp_low_envelope.push(rms_low);
                                let ratio = if rms > 0.0001 { rms_vocal / rms } else { 0.0 };
                                temp_vocal.push(ratio);
                                current_sum_sq = 0.0;
                                current_low_sum_sq = 0.0;
                                current_vocal_sum_sq = 0.0;
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
                            current_sum_sq += val * val;
                            let vocal = vocal_filter.process(val);
                            let low = lpf.process(val);
                            current_low_sum_sq += low * low;
                            current_vocal_sum_sq += vocal * vocal;
                            current_count += 1;
                            if current_count >= window_size {
                                let rms = (current_sum_sq / window_size as f32).sqrt();
                                let rms_low = (current_low_sum_sq / window_size as f32).sqrt();
                                let rms_vocal = (current_vocal_sum_sq / window_size as f32).sqrt();
                                temp_envelope.push(rms);
                                temp_low_envelope.push(rms_low);
                                let ratio = if rms > 0.0001 { rms_vocal / rms } else { 0.0 };
                                temp_vocal.push(ratio);
                                current_sum_sq = 0.0;
                                current_low_sum_sq = 0.0;
                                current_vocal_sum_sq = 0.0;
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
                            let vocal = vocal_filter.process(val);
                            current_sum_sq += val * val;
                            let low = lpf.process(val);
                            current_low_sum_sq += low * low;
                            current_vocal_sum_sq += vocal * vocal;
                            current_count += 1;
                            if current_count >= window_size {
                                let rms = (current_sum_sq / window_size as f32).sqrt();
                                let rms_low = (current_low_sum_sq / window_size as f32).sqrt();
                                let rms_vocal = (current_vocal_sum_sq / window_size as f32).sqrt();
                                temp_envelope.push(rms);
                                temp_low_envelope.push(rms_low);
                                let ratio = if rms > 0.0001 { rms_vocal / rms } else { 0.0 };
                                temp_vocal.push(ratio);
                                current_sum_sq = 0.0;
                                current_low_sum_sq = 0.0;
                                current_vocal_sum_sq = 0.0;
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
                            let vocal = vocal_filter.process(val);
                            current_sum_sq += val * val;
                            let low = lpf.process(val);
                            current_low_sum_sq += low * low;
                            current_vocal_sum_sq += vocal * vocal;
                            current_count += 1;
                            if current_count >= window_size {
                                let rms = (current_sum_sq / window_size as f32).sqrt();
                                let rms_low = (current_low_sum_sq / window_size as f32).sqrt();
                                let rms_vocal = (current_vocal_sum_sq / window_size as f32).sqrt();
                                temp_envelope.push(rms);
                                temp_low_envelope.push(rms_low);
                                let ratio = if rms > 0.0001 { rms_vocal / rms } else { 0.0 };
                                temp_vocal.push(ratio);
                                current_sum_sq = 0.0;
                                current_low_sum_sq = 0.0;
                                current_vocal_sum_sq = 0.0;
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
                            let vocal = vocal_filter.process(val);
                            current_sum_sq += val * val;
                            let low = lpf.process(val);
                            current_low_sum_sq += low * low;
                            current_vocal_sum_sq += vocal * vocal;
                            current_count += 1;
                            if current_count >= window_size {
                                let rms = (current_sum_sq / window_size as f32).sqrt();
                                let rms_low = (current_low_sum_sq / window_size as f32).sqrt();
                                let rms_vocal = (current_vocal_sum_sq / window_size as f32).sqrt();
                                temp_envelope.push(rms);
                                temp_low_envelope.push(rms_low);
                                let ratio = if rms > 0.0001 { rms_vocal / rms } else { 0.0 };
                                temp_vocal.push(ratio);
                                current_sum_sq = 0.0;
                                current_low_sum_sq = 0.0;
                                current_vocal_sum_sq = 0.0;
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
        let rms_vocal = (current_vocal_sum_sq / window_size as f32).sqrt();
        temp_envelope.push(rms);
        temp_low_envelope.push(rms_low);
        let ratio = if rms > 0.0001 { rms_vocal / rms } else { 0.0 };
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
    if let Some(tot) = total_duration {
        duration = tot;
    }
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
    let (bpm, bpm_conf, first_beat) =
        detect_bpm_from_envelope(&full_envelope, &full_low_envelope, env_rate);

    // 3. Drop/Chorus Detection (Energy Surge)
    let drop_pos = detect_drop_pos(&head_envelope, env_rate);

    // 4. 智能切点（人声/活跃度）
    // 人声判定：整体电平 + 人声频段占比
    let is_vocal = |rms: f32, ratio: f32| -> bool { rms > 0.01 && ratio > 0.18 };

    // Detect Vocal In (in Head)
    let mut vocal_in = None;
    for (i, (&rms, &ratio)) in head_envelope
        .iter()
        .zip(head_vocal_ratio.iter())
        .enumerate()
    {
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
    let target_env = if !tail_envelope.is_empty() {
        &tail_envelope
    } else {
        &head_envelope
    };
    let target_ratio = if !tail_vocal_ratio.is_empty() {
        &tail_vocal_ratio
    } else {
        &head_vocal_ratio
    };

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
                if i > 0 {
                    i -= 1;
                }
                continue;
            }
        }
        if i == 0 {
            break;
        }
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
                        vocal_out =
                            Some(duration - (tail_envelope.len() as f64 / env_rate - local_time));
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

    let has_tail = !tail_envelope.is_empty() && !tail_vocal_ratio.is_empty();
    let effective_end = if !has_tail && duration > max_time * 2.0 {
        duration
    } else {
        fade_out.min(duration).max(0.0)
    };

    let (vocal_check_env, vocal_check_ratio, vocal_check_base_time) = if has_tail {
        let tail_len_sec = tail_envelope.len().min(tail_vocal_ratio.len()) as f64 / env_rate;
        (
            &tail_envelope,
            &tail_vocal_ratio,
            (duration - tail_len_sec).max(0.0),
        )
    } else {
        (&head_envelope, &head_vocal_ratio, 0.0)
    };

    let usable_vocal_out = if let (Some(v_out), Some(v_last_in)) = (vocal_out, vocal_last_in) {
        if !has_tail && duration > max_time * 2.0 {
            None
        } else if has_tail && v_out < (duration - max_time - 1.0) {
            None
        } else if !(fade_in <= v_last_in && v_last_in <= v_out && v_out <= effective_end) {
            None
        } else {
            let check_end = (v_out + 2.0).min(effective_end);
            let check_start = v_out.min(check_end);
            let len = vocal_check_env.len().min(vocal_check_ratio.len()) as isize;
            let start_idx =
                (((check_start - vocal_check_base_time) * env_rate).floor() as isize).clamp(0, len);
            let end_idx =
                (((check_end - vocal_check_base_time) * env_rate).ceil() as isize).clamp(0, len);

            let frames = (end_idx - start_idx).max(0) as usize;
            let min_frames = (env_rate * 1.0) as usize;
            if frames < min_frames || frames == 0 {
                Some(v_out)
            } else {
                let mut non_vocal = 0usize;
                for i in start_idx..end_idx {
                    let idx = i as usize;
                    if idx >= vocal_check_env.len() || idx >= vocal_check_ratio.len() {
                        break;
                    }
                    if !is_vocal(vocal_check_env[idx], vocal_check_ratio[idx]) {
                        non_vocal += 1;
                    }
                }

                if (non_vocal as f64 / frames as f64) >= 0.8 {
                    Some(v_out)
                } else {
                    None
                }
            }
        }
    } else {
        None
    };

    let vocal_guard_sec = 2.0;
    let max_outro_keep_sec = 40.0;

    let mut search_end = (effective_end - 0.5).max(0.0);
    if let Some(v_out) = usable_vocal_out {
        search_end = search_end.min(v_out + max_outro_keep_sec);
    }

    let search_start = if let Some(v_out) = usable_vocal_out {
        (v_out + vocal_guard_sec).min(search_end)
    } else {
        (fade_in + 30.0).min(search_end)
    };

    let smart_cut_out = if let (Some(bpm_val), Some(f_beat)) = (bpm, first_beat) {
        let confidence = bpm_conf.unwrap_or(0.0);
        let seconds_per_bar = (60.0 / bpm_val) * 4.0;
        if !seconds_per_bar.is_finite() || seconds_per_bar <= 0.0 {
            Some(search_end)
        } else {
            let mut t = search_end;
            let mut best = None;
            for _ in 0..512 {
                let cand = snap_cut_out_floor(t, bpm_val, f_beat, confidence, search_end);
                if cand < search_start {
                    break;
                }
                best = Some(cand);

                let step = seconds_per_bar * 0.25;
                if !step.is_finite() || step <= 0.0 || cand <= 0.0 {
                    break;
                }
                t = cand - step;
                if t < 0.0 {
                    break;
                }
            }

            let mut cut = best.unwrap_or(search_end);
            if let Some(v_out) = usable_vocal_out {
                cut = cut.max(v_out + vocal_guard_sec);
            }
            Some(cut.min(search_end).max(0.0))
        }
    } else if let Some(v_out) = usable_vocal_out {
        Some(
            (v_out + 20.0)
                .min(search_end)
                .max(v_out + vocal_guard_sec)
                .min(search_end)
                .max(0.0),
        )
    } else {
        Some(search_end)
    };

    // Cut In Logic (Back-Calculation)
    let smart_cut_in = if let (Some(bpm_val), Some(f_beat)) = (bpm, first_beat) {
        let confidence = bpm_conf.unwrap_or(0.0);
        let target_anchor = if let Some(v_in) = vocal_in {
            Some(v_in)
        } else if let Some(d_pos) = drop_pos {
            Some(d_pos)
        } else {
            None
        };

        if let Some(anchor) = target_anchor {
            Some(find_best_phrase_start(
                anchor, bpm_val, f_beat, fade_in, confidence,
            ))
        } else {
            Some(f_beat.max(fade_in))
        }
    } else {
        Some(fade_in)
    };

    let loudness = loudness_meter.get_lufs();
    let (key_root, key_mode, key_confidence) = detect_key_from_pcm(&head_pcm, sample_rate);

    let mut mix_center = smart_cut_out.unwrap_or((duration - 10.0).max(0.0));
    if !mix_center.is_finite() {
        mix_center = (duration - 10.0).max(0.0);
    }
    mix_center = mix_center.min(duration).max(0.0);

    let target_mix_duration = if let Some(b) = bpm {
        if b.is_finite() && b > 0.0 {
            let sec_per_bar = 240.0 / b;
            if sec_per_bar.is_finite() && sec_per_bar > 0.0 {
                (sec_per_bar * 8.0).clamp(15.0, 30.0)
            } else {
                20.0
            }
        } else {
            20.0
        }
    } else {
        20.0
    };

    let half_duration = target_mix_duration * 0.5;
    let mut raw_mix_start = (mix_center - half_duration).max(0.0);
    let mut raw_mix_end = (mix_center + half_duration).min(duration);

    if has_tail {
        let tail_len_sec = tail_envelope.len() as f64 / env_rate;
        let tail_start_time = (duration - tail_len_sec).max(0.0);
        let check_start_rel = (raw_mix_start - tail_start_time).max(0.0);
        let check_end_rel = (mix_center - tail_start_time).max(0.0);

        let len = tail_envelope.len().min(tail_vocal_ratio.len());
        let start_idx = ((check_start_rel * env_rate).floor() as isize).clamp(0, len as isize);
        let end_idx = ((check_end_rel * env_rate).ceil() as isize).clamp(0, len as isize);

        if end_idx > start_idx {
            let slice = &tail_vocal_ratio[start_idx as usize..end_idx as usize];
            let vocal_count = slice.iter().filter(|&&r| r > 0.2).count();
            let vocal_percent = vocal_count as f64 / slice.len().max(1) as f64;
            if vocal_percent > 0.4 {
                raw_mix_start = mix_center;
            }
        }
    }

    raw_mix_start = raw_mix_start.min(mix_center).max(0.0);
    raw_mix_end = raw_mix_end.max(mix_center).min(duration);

    let profile_rate = 10.0;
    let profile_len = ((duration * profile_rate).ceil() as usize).max(1);
    let mut energy_profile = vec![0.0f64; profile_len];

    for (i, &val) in head_envelope.iter().enumerate() {
        let time = i as f64 / env_rate;
        let profile_idx = (time * profile_rate) as usize;
        if profile_idx < energy_profile.len() {
            energy_profile[profile_idx] = energy_profile[profile_idx].max(val as f64);
        }
    }

    if has_tail {
        let tail_len_sec = tail_envelope.len() as f64 / env_rate;
        let tail_start_time = (duration - tail_len_sec).max(0.0);
        for (i, &val) in tail_envelope.iter().enumerate() {
            let time = tail_start_time + (i as f64 / env_rate);
            let profile_idx = (time * profile_rate) as usize;
            if profile_idx < energy_profile.len() {
                energy_profile[profile_idx] = energy_profile[profile_idx].max(val as f64);
            }
        }
    }

    let camelot_key = match (key_root, key_mode) {
        (Some(r), Some(m)) => get_camelot_key(r, m),
        _ => None,
    };

    let fade_out_pos = if include_tail { fade_out } else { duration };
    let vocal_out_pos = if include_tail { vocal_out } else { None };
    let vocal_last_in_pos = if include_tail { vocal_last_in } else { None };
    let outro_energy_level = if include_tail {
        outro_energy_level
    } else {
        None
    };
    let cut_out_pos = if include_tail { smart_cut_out } else { None };

    Some(AudioAnalysis {
        duration,
        bpm,
        bpm_confidence: bpm_conf,
        fade_in_pos: fade_in,
        fade_out_pos,
        first_beat_pos: first_beat,
        loudness: Some(loudness),
        drop_pos,
        version: 11,
        analyze_window: max_time,
        cut_in_pos: smart_cut_in,
        cut_out_pos,
        mix_center_pos: mix_center,
        mix_start_pos: raw_mix_start,
        mix_end_pos: raw_mix_end,
        energy_profile,
        vocal_in_pos: vocal_in,
        vocal_out_pos,
        vocal_last_in_pos,
        outro_energy_level,
        key_root,
        key_mode,
        key_confidence,
        camelot_key,
    })
}

#[napi]
pub fn analyze_audio_file(path: String, max_analyze_time: Option<f64>) -> Option<AudioAnalysis> {
    internal_analyze_impl(&path, max_analyze_time, true)
}

#[napi]
pub fn analyze_audio_file_head(
    path: String,
    max_analyze_time: Option<f64>,
) -> Option<AudioAnalysis> {
    internal_analyze_impl(&path, max_analyze_time, false)
}

#[napi]
pub fn suggest_transition(current_path: String, next_path: String) -> Option<TransitionProposal> {
    let current = internal_analyze_impl(&current_path, None, true)?;
    let next = internal_analyze_impl(&next_path, Some(120.0), false)?;

    let bpm_a = current.bpm.unwrap_or(128.0).max(1.0);
    let bpm_b = next.bpm.unwrap_or(128.0).max(1.0);
    let bpm_diff_pct = (bpm_a - bpm_b).abs() / bpm_a;
    let bpm_compatible = bpm_diff_pct < 0.06;

    let key_compatible = match (current.camelot_key.as_deref(), next.camelot_key.as_deref()) {
        (Some(a), Some(b)) => is_camelot_compatible(a, b),
        _ => false,
    };

    let cur_fade_out = current.fade_out_pos.max(0.0);
    let cur_ideal_out = current.cut_out_pos.unwrap_or(cur_fade_out).max(0.0);
    let cur_first_beat = current.first_beat_pos.unwrap_or(0.0).max(0.0);
    let conf_a = current.bpm_confidence.unwrap_or(0.0);

    let next_first_beat = next.first_beat_pos.unwrap_or(0.0).max(0.0);
    let next_vocal_in = next
        .vocal_in_pos
        .unwrap_or(next.drop_pos.unwrap_or(30.0 + next_first_beat));
    let next_landing_point = next_vocal_in.max(next_first_beat + 2.0);

    let seconds_per_bar_a = (240.0 / bpm_a).max(0.1);
    let seconds_per_bar_b = (240.0 / bpm_b).max(0.1);

    let candidate_bars = [32.0, 16.0, 8.0, 4.0, 2.0];

    let mut selected_duration = 0.0;
    let mut selected_next_in = 0.0;
    let mut selected_cur_out = 0.0;
    let mut strategy_name = String::new();
    let mut filter_strategy = String::new();
    let mut found_strategy = false;

    for &bars in candidate_bars.iter() {
        let duration = bars * seconds_per_bar_a;

        let raw_next_in = next_landing_point - duration;
        if raw_next_in < (next_first_beat - seconds_per_bar_b * 0.25) {
            continue;
        }

        let snapped_next_in = snap_to_bar_floor(
            raw_next_in,
            bpm_b,
            next_first_beat,
            next.bpm_confidence.unwrap_or(0.0),
        );
        if snapped_next_in < next_first_beat - 0.1 {
            continue;
        }

        let mut snapped_cur_start =
            snap_to_phrase_floor(cur_ideal_out, bpm_a, cur_first_beat, conf_a, 16.0);
        // 如果 snap 导致时间回退太远 (超过 30s)，则说明 phrase 网格不合适，尝试更细的网格 (4 Bar)
        if cur_ideal_out - snapped_cur_start > 30.0 {
            snapped_cur_start =
                snap_to_phrase_floor(cur_ideal_out, bpm_a, cur_first_beat, conf_a, 16.0);
            if cur_ideal_out - snapped_cur_start > 15.0 {
                snapped_cur_start = snap_to_bar_floor(cur_ideal_out, bpm_a, cur_first_beat, conf_a);
            }
        }
        let remaining_len = current.duration - snapped_cur_start;
        if remaining_len < duration * 0.8 {
            continue;
        }

        if bars == 32.0 {
            if bpm_compatible && key_compatible {
                selected_duration = duration;
                selected_next_in = snapped_next_in;
                selected_cur_out = snapped_cur_start;
                strategy_name = "Harmonic Deep Blend (32 Bars)".to_string();
                filter_strategy = "Eq Swap (Bass/Mid)".to_string();
                found_strategy = true;
                break;
            }
            if bpm_compatible {
                selected_duration = duration;
                selected_next_in = snapped_next_in;
                selected_cur_out = snapped_cur_start;
                strategy_name = "Long Filter Blend (32 Bars)".to_string();
                filter_strategy = "Bass Swap / LPF".to_string();
                found_strategy = true;
                break;
            }
        }

        if bars == 16.0 && bpm_compatible {
            selected_duration = duration;
            selected_next_in = snapped_next_in;
            selected_cur_out = snapped_cur_start;
            strategy_name = if key_compatible {
                "Standard Blend (16 Bars)".to_string()
            } else {
                "Filter Blend (16 Bars)".to_string()
            };
            filter_strategy = if key_compatible {
                "Eq Mixing".to_string()
            } else {
                "Bass Cut Out".to_string()
            };
            found_strategy = true;
            break;
        }

        if bars == 8.0 {
            selected_duration = duration;
            selected_next_in = snapped_next_in;
            selected_cur_out = snapped_cur_start;
            strategy_name = "Short Blend (8 Bars)".to_string();
            filter_strategy = "Wash Out / Echo".to_string();
            found_strategy = true;
            break;
        }

        if bars == 4.0 {
            selected_duration = duration;
            selected_next_in = snapped_next_in;
            selected_cur_out = snapped_cur_start;
            strategy_name = "Quick Blend (4 Bars)".to_string();
            filter_strategy = if bpm_compatible {
                "Quick Fade".to_string()
            } else {
                "Echo Freeze".to_string()
            };
            found_strategy = true;
            break;
        }

        if bars == 2.0 {
            selected_duration = duration;
            selected_next_in = snapped_next_in;
            selected_cur_out = snapped_cur_start;
            strategy_name = "Rapid Bass Swap (2 Bars)".to_string();
            filter_strategy = "Bass Swap / LPF".to_string();
            found_strategy = true;
            break;
        }
    }

    if !found_strategy {
        let next_safe_intro_len = next_landing_point - next_first_beat;

        // [Refactor] Echo Out / Hard Cut 降级为最低优先级
        // 只要 BPM 兼容，无条件优先尝试 Aggressive Blend (Bass Swap)
        let mut aggressive_success = false;

        if bpm_compatible {
            // 尝试列表: 32 -> 16 -> 8 -> 4 -> 2
            // 用户要求：直接长 Bass Swap / LPF，2bar 短混音也用 Bass Swap
            let candidates = [32.0, 16.0, 8.0, 4.0, 2.0];

            for &bars in candidates.iter() {
                let target_dur = seconds_per_bar_a * bars;
                let cur_remaining = (current.duration - cur_ideal_out).max(0.0);

                // 只有当 Current 剩余足够长时才混
                // 宽松系数 0.8: 允许 Current 稍微不够一点，靠后续 Clamp
                if cur_remaining > target_dur * 0.8 {
                    selected_duration = target_dur;
                    selected_next_in = next_first_beat;
                    selected_cur_out =
                        snap_to_bar_floor(cur_ideal_out, bpm_a, cur_first_beat, conf_a);

                    strategy_name = format!("Aggressive Blend ({} Bars)", bars);
                    // 4 Bar 用 Quick Fade，长得用 Bass Swap，2 Bar 也用 Bass Swap
                    if bars == 4.0 {
                        filter_strategy = "Quick Fade".to_string();
                    } else {
                        filter_strategy = "Bass Swap / LPF".to_string();
                    }
                    aggressive_success = true;
                    break;
                }
            }
        }

        if !aggressive_success {
            // Fallback 区域：BPM 不兼容 或 Current 实在太短

            // 只有当 Intro 极短 (< 1 Beat) 时才 Hard Cut
            if next_safe_intro_len < seconds_per_bar_b * 0.25 {
                selected_next_in = next_first_beat;
                selected_cur_out = snap_to_bar_floor(cur_ideal_out, bpm_a, cur_first_beat, conf_a);
                selected_duration = seconds_per_bar_a * 1.0;
                strategy_name = "Hard Cut (No Intro)".to_string();
                filter_strategy = "None".to_string();
            } else {
                // Echo Out Logic (Lowest Priority Fallback)
                selected_cur_out = snap_to_bar_floor(cur_ideal_out, bpm_a, cur_first_beat, conf_a);

                // [优化] Echo Out 时长策略：
                // 1. 如果有空间，尽量给足 4 小节 (Echo Out 需要时间衰减)
                // 2. 至少给 1 小节，避免太快
                // 3. 取 next_safe_intro_len 的限制
                // 4. [Fix] 还要受限于 Current Track 剩余时长，避免被后续逻辑截断导致 Voice 不对齐
                let ideal_echo_len = seconds_per_bar_a * 4.0;

                let cur_tail_len = (current.duration - selected_cur_out).max(0.0);
                // 允许稍微超出一点 (1.5倍)，后续逻辑会处理宽松度，但这里先给一个合理的上限
                let effective_max_len = next_safe_intro_len.min(cur_tail_len * 1.5);

                selected_duration = effective_max_len
                    .min(ideal_echo_len)
                    .max(seconds_per_bar_a * 1.0);

                // 安全检查：如果 next_safe_intro_len 真的很短
                if selected_duration > next_safe_intro_len {
                    selected_duration = next_safe_intro_len;
                }

                // [Fix] 智能对齐：让过渡结束点对齐 Voice Start
                // 默认从头开始
                selected_next_in = next_first_beat;

                // 如果 Intro 很长 (比如 7s) 但过渡很短 (比如 2.2s)，则跳过前段 Intro
                // 使得 selected_next_in + selected_duration ≈ next_landing_point
                if next_safe_intro_len > selected_duration + 0.5 {
                    let ideal_start = next_landing_point - selected_duration;
                    // 对齐到最近的 Beat
                    let sec_per_beat = 60.0 / bpm_b;
                    let beats = (ideal_start - next_first_beat) / sec_per_beat;

                    // [Fix] 使用 round() 找最近的 Beat，而不是 floor()，减少时间误差
                    // 并重新计算 duration 以精确对齐 Vocal
                    let snapped_beats = beats.round();
                    let aligned_start = next_first_beat + (snapped_beats * sec_per_beat);

                    selected_next_in = aligned_start.max(next_first_beat);

                    // [Fix] 重新计算 duration，以确保结束点精确对齐 Vocal (Fill the gap)
                    let new_duration = next_landing_point - selected_next_in;

                    // 安全检查：时长必须合理
                    let min_dur = seconds_per_bar_a * 0.5; // 至少半小节
                                                           // 上限：允许稍微超过 ideal_echo_len，也允许稍微超过 cur_tail
                    let max_dur =
                        (ideal_echo_len + seconds_per_bar_a).min(cur_tail_len * 2.0 + 5.0);

                    if new_duration >= min_dur && new_duration <= max_dur {
                        selected_duration = new_duration;
                    }
                }

                strategy_name = "Echo Out Transition".to_string();
                filter_strategy = "Echo Freeze".to_string();
            }
        }
    }

    if !selected_duration.is_finite() || selected_duration <= 0.0 {
        return None;
    }

    // 安全检查：防止计算出的时间为负数或超出范围
    selected_next_in = selected_next_in.max(0.0);
    let next_max_start = (next.duration - 5.0).max(0.0);
    if selected_next_in > next_max_start {
        selected_next_in = next.first_beat_pos.unwrap_or(0.0).max(0.0);
    }

    selected_cur_out = selected_cur_out
        .max(0.0)
        .min((current.duration - 1.0).max(0.0));

    let cur_avail = (current.duration - selected_cur_out).max(0.0);
    let next_avail = (next.duration - selected_next_in).max(0.0);

    // [优化] 如果空间不够，优先保持 selected_duration，哪怕稍微超出一点点 next_avail
    // 只有当超出很多时才裁剪
    if selected_duration > next_avail {
        // 如果 next_avail 至少有 2/3 的 duration，就允许 (稍微混到下一首歌的人声也没事，总比硬切好)
        if next_avail > selected_duration * 0.6 {
            // Keep duration, but clamp next_in if possible? No, we need duration.
            // Do nothing, trust selected_duration.
        } else {
            selected_duration = next_avail;
        }
    }

    // 同理，如果 current 剩余时间不够，但差的不多，也允许混完
    if selected_duration > cur_avail {
        if cur_avail > selected_duration * 0.6 {
            // Keep
        } else {
            selected_duration = cur_avail;
        }
    }

    if !selected_duration.is_finite() || selected_duration <= 0.0 {
        return None;
    }

    let mut score: f64 = 0.5;
    if bpm_compatible {
        score += 0.3;
    }
    if key_compatible {
        score += 0.1;
    }
    if selected_duration >= 10.0 {
        score += 0.1;
    }
    if strategy_name.contains("Hard Cut") {
        score -= 0.2;
    }
    score = score.clamp(0.0, 1.0);

    Some(TransitionProposal {
        duration: selected_duration,
        current_track_mix_out: selected_cur_out,
        next_track_mix_in: selected_next_in,
        mix_type: strategy_name,
        filter_strategy,
        compatibility_score: score,
        key_compatible,
        bpm_compatible,
    })
}

fn detect_silence_from_envelope(envelope: &[f32], rate: f64, threshold_db: f32) -> (f64, f64) {
    if envelope.is_empty() {
        return (0.0, 0.0);
    }

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

fn detect_bpm_from_envelope(
    envelope: &[f32],
    low_envelope: &[f32],
    rate: f64,
) -> (Option<f64>, Option<f64>, Option<f64>) {
    let len = envelope.len().min(low_envelope.len());
    if len < 100 {
        return (None, None, None);
    }

    // Compute flux (Spectral Flux approximation using envelope difference)
    // Half-wave rectification
    let mut flux_full = Vec::with_capacity(len);
    let mut flux_low = Vec::with_capacity(len);
    flux_full.push(0.0);
    flux_low.push(0.0);
    for i in 1..len {
        let diff_full = envelope[i] - envelope[i - 1];
        flux_full.push(if diff_full > 0.0 { diff_full } else { 0.0 });
        let diff_low = low_envelope[i] - low_envelope[i - 1];
        flux_low.push(if diff_low > 0.0 { diff_low } else { 0.0 });
    }

    // Autocorrelation
    // Rate 50Hz.
    // 60 BPM = 1s = 50 samples
    // 180 BPM = 0.33s = 16.6 samples
    let min_lag = 15;
    let max_lag = 55;

    if flux_full.len() < max_lag * 2 {
        return (None, None, None);
    }

    let mut correlations = Vec::new();

    for lag in min_lag..=max_lag {
        let mut corr = 0.0;
        let start_idx = 0;
        let end_idx = flux_full.len() - lag;
        // Step by 1 for better accuracy on envelope
        for i in start_idx..end_idx {
            corr += flux_full[i] * flux_full[i + lag];
        }
        correlations.push((lag, corr));
    }

    correlations.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));

    if correlations.is_empty() {
        return (None, None, None);
    }

    let (best_lag, max_corr) = correlations[0];

    if max_corr < 0.0001 {
        return (None, None, None);
    }

    let period = best_lag as f64 / rate;
    let bpm = 60.0 / period;

    let avg_corr: f32 = correlations.iter().map(|c| c.1).sum::<f32>() / correlations.len() as f32;
    let confidence = if avg_corr > 0.0 {
        ((max_corr / avg_corr) - 1.0) / 5.0
    } else {
        0.0
    };
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

            let best_phase = if bar_ok {
                best_phase_bar
            } else {
                best_phase_beat
            };
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
    if pcm.len() < frame_size {
        return (None, None, None);
    }
    if sample_rate == 0 {
        return (None, None, None);
    }

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
        if hz < min_hz || hz > max_hz {
            continue;
        }
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
            let Some(pc) = bin_to_pc[bin] else {
                continue;
            };
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
    if chroma_l2 <= 0.0 {
        return (None, None, None);
    }
    let chroma_l2 = chroma_l2.sqrt();
    let mut chroma_norm = [0.0f32; 12];
    for (i, v) in chroma.iter().enumerate() {
        chroma_norm[i] = *v / chroma_l2;
    }

    let major = [
        6.35f32, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88,
    ];
    let minor = [
        6.33f32, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17,
    ];

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

    if best_score <= 0.0 {
        return (None, None, None);
    }
    let confidence = ((best_score - second_score) / best_score).clamp(0.0, 1.0) as f64;
    if confidence < 0.05 {
        return (None, None, None);
    }

    (Some(best_root), Some(best_mode), Some(confidence))
}

fn detect_drop_pos(envelope: &[f32], rate: f64) -> Option<f64> {
    // Detect energy surge (Drop / Chorus)
    // Sliding window average energy
    let window_len = (2.0 * rate) as usize; // 2 seconds
    if envelope.len() < window_len * 2 {
        return None;
    }

    let mut max_diff = 0.0;
    let mut drop_idx = 0;

    // Calculate moving average
    // We look for a point where Avg(Current 2s) >> Avg(Previous 4s)

    for i in (rate as usize * 4)..envelope.len() - window_len {
        // Prev 4s average
        let prev_len = (rate * 4.0) as usize;
        let prev_sum: f32 = envelope[i - prev_len..i].iter().sum();
        let prev_avg = prev_sum / prev_len as f32;

        // Next 2s average
        let next_sum: f32 = envelope[i..i + window_len].iter().sum();
        let next_avg = next_sum / window_len as f32;

        if prev_avg > 0.001 {
            let ratio = next_avg / prev_avg;
            if ratio > max_diff {
                max_diff = ratio;
                drop_idx = i;
            }
        }
    }

    if max_diff > 1.5 {
        // 50% energy increase
        Some(drop_idx as f64 / rate)
    } else {
        None
    }
}

#[napi(object)]
#[derive(Clone, Debug)]
pub struct AutomationPoint {
    pub time_offset: f64, // Seconds relative to mix_start
    pub volume: f64,      // 0.0 - 1.0
    pub low_cut: f64,     // 0.0 (No Cut) - 1.0 (Full Cut)
    pub high_cut: f64,    // 0.0 (No Cut) - 1.0 (Full Cut)
}

#[napi(object)]
pub struct AdvancedTransition {
    pub start_time_current: f64,
    pub start_time_next: f64,
    pub duration: f64,

    #[napi(js_name = "pitch_shift_semitones")]
    pub pitch_shift_semitones: i32,

    #[napi(js_name = "playback_rate")]
    pub playback_rate: f64,

    #[napi(js_name = "automation_current")]
    pub automation_current: Vec<AutomationPoint>,

    #[napi(js_name = "automation_next")]
    pub automation_next: Vec<AutomationPoint>,

    pub strategy: String,
}

fn camelot_to_semitone(num: i32, mode: char) -> i32 {
    // Camelot Wheel to Semitone Index (0-11, where 0=C, 1=Db, etc.)
    // 8B = C Major -> 0
    let base = match num {
        8 => 0,
        9 => 7,
        10 => 2,
        11 => 9,
        12 => 4,
        1 => 11,
        2 => 6,
        3 => 1,
        4 => 8,
        5 => 3,
        6 => 10,
        7 => 5,
        _ => 0, // Fallback
    };

    if mode == 'A' {
        (base + 9) % 12
    } else {
        base
    }
}

fn calc_key_distance(key_a: Option<&str>, key_b: Option<&str>) -> (i32, i32) {
    let (Some(ka), Some(kb)) = (key_a, key_b) else {
        return (100, 0);
    };
    let (Some((root_a, mode_a)), Some((root_b, mode_b))) = (parse_camelot(ka), parse_camelot(kb))
    else {
        return (100, 0);
    };

    if root_a == root_b && mode_a == mode_b {
        return (0, 0);
    }

    let diff = (root_a - root_b).abs();
    let circle_dist = diff.min(12 - diff);

    if circle_dist <= 1 && mode_a == mode_b {
        return (1, 0); // Neighbor
    }

    // Calculate semitone shift
    let semi_a = camelot_to_semitone(root_a, mode_a);
    let semi_b = camelot_to_semitone(root_b, mode_b);

    let mut shift = semi_a - semi_b;

    // Normalize to -6 to +6
    while shift > 6 {
        shift -= 12;
    }
    while shift < -6 {
        shift += 12;
    }

    (circle_dist, shift)
}

fn generate_bass_swap_automation(duration: f64) -> (Vec<AutomationPoint>, Vec<AutomationPoint>) {
    let mut auto_a = Vec::new();
    let mut auto_b = Vec::new();

    let mid_point = duration / 2.0;

    // Start: A Full, B No Bass/Low Vol
    auto_a.push(AutomationPoint {
        time_offset: 0.0,
        volume: 1.0,
        low_cut: 0.0,
        high_cut: 0.0,
    });
    auto_b.push(AutomationPoint {
        time_offset: 0.0,
        volume: 0.8,
        low_cut: 1.0,
        high_cut: 0.0,
    });

    // Pre-Swap
    auto_a.push(AutomationPoint {
        time_offset: mid_point - 2.0,
        volume: 1.0,
        low_cut: 0.0,
        high_cut: 0.0,
    });
    auto_b.push(AutomationPoint {
        time_offset: mid_point - 2.0,
        volume: 1.0,
        low_cut: 1.0,
        high_cut: 0.0,
    });

    // Swap Point (X-Fade Bass)
    auto_a.push(AutomationPoint {
        time_offset: mid_point,
        volume: 0.9,
        low_cut: 0.5,
        high_cut: 0.0,
    });
    auto_b.push(AutomationPoint {
        time_offset: mid_point,
        volume: 0.9,
        low_cut: 0.5,
        high_cut: 0.0,
    });

    // Post-Swap
    auto_a.push(AutomationPoint {
        time_offset: mid_point + 2.0,
        volume: 0.8,
        low_cut: 1.0,
        high_cut: 0.1,
    });
    auto_b.push(AutomationPoint {
        time_offset: mid_point + 2.0,
        volume: 1.0,
        low_cut: 0.0,
        high_cut: 0.0,
    });

    // End
    auto_a.push(AutomationPoint {
        time_offset: duration,
        volume: 0.0,
        low_cut: 1.0,
        high_cut: 1.0,
    });
    auto_b.push(AutomationPoint {
        time_offset: duration,
        volume: 1.0,
        low_cut: 0.0,
        high_cut: 0.0,
    });

    (auto_a, auto_b)
}

#[napi]
pub fn suggest_long_mix(current_path: String, next_path: String) -> Option<AdvancedTransition> {
    let current = internal_analyze_impl(&current_path, None, true)?;
    let next = internal_analyze_impl(&next_path, Some(180.0), false)?;

    // 1. 强制 BPM 同步
    let bpm_a = current.bpm.unwrap_or(128.0);
    let bpm_b = next.bpm.unwrap_or(128.0);
    let playback_rate = bpm_a / bpm_b; // 把 B 加速/减速到 A

    // 2. 调性检测
    let (_, shift) = calc_key_distance(current.camelot_key.as_deref(), next.camelot_key.as_deref());

    // 3. 寻找长混音区间 (Long Blend)
    // 目标：至少 32 Bar (约 1 分钟 @ 128BPM)，甚至 64 Bar

    let sec_per_bar = 240.0 / bpm_a;
    let target_bars = 32.0;
    let mix_duration = target_bars * sec_per_bar;

    // 锚点 A: Current 的 "Cut Out" 并不是真正的结束，而是混音的结束点
    // 我们希望 Current 播放到尽量后面，但在结束前留出 mix_duration
    let cur_end_anchor = current.duration - 5.0;
    // 对齐到 Bar
    let cur_mix_end = snap_to_bar_floor(
        cur_end_anchor,
        bpm_a,
        current.first_beat_pos.unwrap_or(0.0),
        0.8,
    );
    let cur_mix_start = cur_mix_end - mix_duration;

    // 锚点 B: Next 的 "Drop" 或 "Vocal In" 作为混音的结束点 (Energy Point)
    // 我们让 Current 的 Bass 在 Next 的 Drop 处彻底消失
    let next_anchor = next.drop_pos.or(next.vocal_in_pos).unwrap_or(30.0);
    // 对齐到 Bar
    let next_mix_end =
        snap_to_bar_floor(next_anchor, bpm_b, next.first_beat_pos.unwrap_or(0.0), 0.8);
    let next_mix_start = next_mix_end - (mix_duration / playback_rate); // 考虑变速后的时长

    // 如果 Next 的开头不够长 (Intro 短于 32 Bar)，我们必须切入更早
    // 这里允许 "负时间" -> 意味着我们要 Loop Next 的开头，或者接受 Next 从中间开始混
    // 既然用户允许 "句子内切"，我们尝试找 Next 的 Verse 1 Start
    let final_next_start = if next_mix_start < 0.0 {
        next.first_beat_pos.unwrap_or(0.0) // 如果不够长，就从头开始，混音长度缩短
    } else {
        next_mix_start
    };

    // 重新计算实际可能的混音时长
    let actual_duration = if next_mix_start < 0.0 {
        next_mix_end - final_next_start
    } else {
        mix_duration
    };

    // 4. 生成自动化曲线 (Automation)
    // 这是让 "句子内切" 听起来不违和的关键：Bass Swap
    let (auto_a, auto_b) = generate_bass_swap_automation(actual_duration);

    Some(AdvancedTransition {
        start_time_current: cur_mix_start.max(0.0),
        start_time_next: final_next_start,
        duration: actual_duration,
        pitch_shift_semitones: shift,
        playback_rate,
        automation_current: auto_a,
        automation_next: auto_b,
        strategy: "Long Harmonic Bass Swap".to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::{detect_key_from_pcm, find_best_phrase_start, snap_to_bar_floor};

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

    #[test]
    fn snap_to_bar_handles_float_edge() {
        let bpm = 120.0;
        let first_beat = 0.0;
        let confidence = 1.0;
        let time = 64.0 - 0.01;
        let snapped = snap_to_bar_floor(time, bpm, first_beat, confidence);
        assert!((snapped - 64.0).abs() < 1e-6);
    }

    #[test]
    fn phrase_start_low_confidence_falls_back_to_fade_in() {
        let res = find_best_phrase_start(100.0, 120.0, 0.0, 5.0, 0.1);
        assert!((res - 5.0).abs() < 1e-9);
    }

    #[test]
    fn phrase_start_prefers_32_bars() {
        let res = find_best_phrase_start(100.0, 120.0, 0.0, 10.0, 1.0);
        assert!((res - 36.0).abs() < 1e-9);
    }

    #[test]
    fn phrase_start_downgrades_to_16_bars() {
        let res = find_best_phrase_start(50.0, 120.0, 0.0, 10.0, 1.0);
        assert!((res - 18.0).abs() < 1e-9);
    }
}
