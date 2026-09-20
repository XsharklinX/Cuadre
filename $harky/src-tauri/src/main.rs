// Oculta la consola en builds de release (Windows)
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    sharky_lib::run()
}
