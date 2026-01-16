use ferrous_opencc::{
    OpenCC,
    config::BuiltinConfig,
};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct TextConverter {
    inner: OpenCC,
}

#[wasm_bindgen]
impl TextConverter {
    #[wasm_bindgen(constructor)]
    #[allow(clippy::missing_errors_doc)]
    pub fn new(config_name: &str) -> Result<Self, JsValue> {
        let config_enum = BuiltinConfig::from_filename(config_name)
            .map_err(|e| JsValue::from_str(&e.to_string()))?;
        let inner =
            OpenCC::from_config(config_enum).map_err(|e| JsValue::from_str(&e.to_string()))?;
        Ok(Self { inner })
    }

    #[wasm_bindgen]
    #[must_use]
    pub fn convert(&self, input: &str) -> String {
        self.inner.convert(input)
    }
}
