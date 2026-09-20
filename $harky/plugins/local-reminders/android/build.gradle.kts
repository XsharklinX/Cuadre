plugins {
    id("com.android.library")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.sharky.finanzas.localreminders"
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
    implementation("androidx.work:work-runtime-ktx:2.10.0")
    implementation("androidx.core:core-ktx:1.13.1")
    // Escritura en la carpeta que el usuario elige por SAF (Storage Access
    // Framework). Necesario para que el backup automatico funcione bajo scoped
    // storage sin rutas publicas codificadas.
    implementation("androidx.documentfile:documentfile:1.0.1")
    // ActivityResult, para recibir la carpeta que devuelve el selector SAF via
    // @ActivityCallback. tauri-android la usa pero como `implementation`, asi
    // que no llega hasta aqui de forma transitiva: hay que declararla.
    implementation("androidx.activity:activity:1.9.3")
    implementation(project(":tauri-android"))
}
