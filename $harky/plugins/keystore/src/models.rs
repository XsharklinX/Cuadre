use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
pub struct EncryptArgs {
    pub plaintext: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct EncryptResult {
    pub iv: String,
    pub data: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct DecryptArgs {
    pub iv: String,
    pub data: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct DecryptResult {
    pub plaintext: String,
}
