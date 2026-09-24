# La API de In-App Updates se resuelve por reflexion en parte de su cadena de
# tareas; sin esto, un build con minify deja de encontrar la actualizacion y
# falla en silencio (lo peor posible: nadie se entera de que no funciona).
-keep class com.google.android.play.core.** { *; }
