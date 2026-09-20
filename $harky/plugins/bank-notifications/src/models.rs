use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize)]
pub struct NoArgs {}

#[derive(Debug, Clone, Deserialize)]
pub struct Empty {}

#[derive(Debug, Clone, Deserialize)]
pub struct HasAccessResult {
    pub granted: bool,
}
