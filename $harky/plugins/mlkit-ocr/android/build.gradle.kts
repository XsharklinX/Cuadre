plugins {
    id("com.android.library")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.sharky.finanzas.mlkitocr"
    compileSdk = 36

    defaultConfig {
        minSdk = 24

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }
    kotlinOptions {
        jvmTarget = "1.8"
    }
}

dependencies {
    // 16.0.1 (última disponible): su libmlkit_google_ocr_pipeline.so YA está
    // alineada a 16 KB — verificado en el AAB. No hace falta subirla.
    implementation("com.google.mlkit:text-recognition:16.0.1")
    implementation("androidx.core:core-ktx:1.9.0")
    implementation(project(":tauri-android"))

    // Pantalla de cámara en vivo (Fase 1 del roadmap de escaneo de recibos).
    implementation("androidx.appcompat:appcompat:1.7.1")
    implementation("androidx.activity:activity-ktx:1.10.1")
    // CameraX 1.4.2: su libimage_processing_util_jni.so está alineada a 16 KB
    // (verificado); la 1.3.4 estaba a 4 KB y era la ÚNICA .so que Play rechazaba.
    // API compatible con el uso del escáner (preview + análisis + captura).
    implementation("androidx.camera:camera-core:1.4.2")
    implementation("androidx.camera:camera-camera2:1.4.2")
    implementation("androidx.camera:camera-lifecycle:1.4.2")
    implementation("androidx.camera:camera-view:1.4.2")
}
