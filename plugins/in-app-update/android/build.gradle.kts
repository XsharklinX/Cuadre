plugins {
    id("com.android.library")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.sharky.finanzas.inappupdate"
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
    // Google Play In-App Updates. Es la UNICA forma de descargar e instalar
    // una actualizacion sin sacar a la persona de la app: abrir la ficha de
    // Play, que es lo que haciamos antes, depende de que encuentre el boton.
    //
    // Se usa el artefacto Java (`app-update`) y no `app-update-ktx` por la
    // misma razon que en play-billing: el -ktx arrastra su propia kotlin-stdlib
    // y aqui no se usa ni una extension ktx — todo es la API de listeners.
    implementation("com.google.android.play:app-update:2.1.0")
    implementation(project(":tauri-android"))
}
