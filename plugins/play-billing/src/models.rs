use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
pub struct Empty {}

/// Estado de la tienda en este dispositivo.
#[derive(Debug, Clone, Deserialize)]
pub struct AvailableResult {
    /// `false` en un dispositivo sin Play Store (emulador pelado, Huawei,
    /// sideload). La app tiene que seguir funcionando: simplemente no vende.
    pub available: bool,
    /// Motivo legible cuando `available` es `false`. Nunca se le enseña tal
    /// cual al usuario; sirve para el panel de desarrollador.
    pub reason: Option<String>,
}

/// El producto tal y como lo devuelve Play: el precio SIEMPRE sale de aqui,
/// nunca escrito a mano en la app. Play lo entrega ya convertido a la moneda
/// y al formato del pais del usuario.
#[derive(Debug, Clone, Deserialize)]
pub struct ProductResult {
    pub found: bool,
    pub product_id: Option<String>,
    /// Precio formateado y listo para pintar ("US$4.99", "RD$299.00").
    pub price: Option<String>,
    pub currency: Option<String>,
    /// Precio en micros (4990000 = 4.99) por si hace falta comparar.
    pub price_micros: Option<i64>,
}

/// Resultado de una compra o de una restauracion.
#[derive(Debug, Clone, Deserialize)]
pub struct PurchaseResult {
    /// `true` solo si Play confirma una compra COMPRADA y reconocida.
    pub owned: bool,
    /// `true` cuando el usuario cerro el dialogo sin comprar: no es un error,
    /// y tratarlo como tal llenaria la pantalla de avisos rojos.
    pub cancelled: bool,
    /// Pendiente de pago (efectivo en tienda, control parental). No es dueño
    /// todavia y no se le puede dar el beneficio.
    pub pending: bool,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ProductArgs {
    #[serde(rename = "productId")]
    pub product_id: String,
}
