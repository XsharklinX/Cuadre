use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecognizeArgs {
    pub image_base64: String,
}

/// Caja delimitadora de un bloque de texto, en coordenadas de píxel de la
/// imagen analizada (no de la vista/preview — el llamador debe escalar según
/// `imageWidth`/`imageHeight` de [`RecognizeResult`]).
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BoundingBox {
    pub left: i32,
    pub top: i32,
    pub right: i32,
    pub bottom: i32,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TextBlock {
    pub text: String,
    /// `None` en los raros casos en que ML Kit no logra calcular la caja del bloque.
    pub bounding_box: Option<BoundingBox>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecognizeResult {
    pub text: String,
    /// Ancho/alto (px) de la imagen que se analizó — necesarios para mapear las
    /// cajas de `blocks` a coordenadas de pantalla al dibujar el recuadro azul.
    pub image_width: i32,
    pub image_height: i32,
    /// Bloques de texto con su caja delimitadora, en el mismo orden que ML Kit
    /// los detecta. Antes se descartaban; se exponen para la cámara en vivo
    /// (Fase 3 del roadmap) sin tener que volver a correr OCR sobre la imagen.
    pub blocks: Vec<TextBlock>,
}
