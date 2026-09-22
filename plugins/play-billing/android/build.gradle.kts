plugins {
    id("com.android.library")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.sharky.finanzas.playbilling"
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
    implementation("androidx.core:core-ktx:1.13.1")
    // Play Billing Library. Es la UNICA forma admitida de cobrar contenido
    // digital dentro de una app publicada en Google Play.
    //
    // 8.x y no 7.x: Play Console RECHAZA los artefactos que suben con la 7 —
    // "debe actualizarse, al menos, a la version 8.0.0". La 8 rompe la API de
    // `queryProductDetailsAsync` (ver PlayBillingPlugin.kt), asi que subir la
    // version no es solo cambiar este numero.
    //
    // `billing` y NO `billing-ktx`: el artefacto -ktx arrastra
    // `kotlin-stdlib 2.2.10`, cuya metadata (2.2.0) el compilador Kotlin de
    // este proyecto (1.9.25) no sabe leer — el build moria con
    // "Class 'kotlin.Unit' was compiled with an incompatible version of
    // Kotlin". El artefacto Java no depende de Kotlin en absoluto, y aqui no
    // se usa ni una sola extension ktx: todo es la API de callbacks.
    implementation("com.android.billingclient:billing:8.3.0")
    implementation(project(":tauri-android"))
}
