# Checklist de verificación en dispositivo — v1.8

Pasar esta lista en el teléfono con el APK nuevo **antes** de subir a Play Store.
Marcar cada punto; si algo falla, anotar QUÉ se ve y en qué pantalla.

## 1. Regresión del portal (lo que estaba roto en 1.7.x)
- [ ] Herramientas (☰): el sheet sale desde abajo, fondo SÓLIDO
- [ ] Ajustes → cualquier sheet (Tema, Moneda, Categorías…): fondo sólido, por encima del panel
- [ ] Cuentas → tocar una cuenta: detalle sólido; "Ocultar tarjeta" (toggle) se ve y funciona
- [ ] Cuentas → editar/crear: editor sólido, sub-sheets (saldo, moneda, últimos 4) POR ENCIMA del editor
- [ ] Presupuestos → editar categoría: editor sólido; numpad de monto por encima y usable
- [ ] Metas → Nueva meta / Editar / Aportar: sheets sólidos y desde ABAJO (no a media pantalla)
- [ ] Numpad de metas: pegado abajo, teclas al alcance del pulgar
- [ ] Movimientos → tocar un movimiento: detalle sólido
- [ ] El menú inferior se esconde cuando hay un sheet abierto y vuelve al cerrarlo

## 2. Cuenta con correo (NUEVO en 1.8)
- [ ] Ajustes → Cuenta: aparece "Iniciar sesión / Crear cuenta" (NO el botón de Google)
- [ ] Crear cuenta con un correo real → mensaje "te enviamos un enlace de confirmación"
- [ ] Abrir el enlace del correo EN EL TELÉFONO → vuelve a la app → sesión iniciada
- [ ] El perfil muestra nombre, correo e ID #XXXXXXXXX
- [ ] "Sincronizar ahora" funciona (crea/actualiza datos en la nube)
- [ ] Cerrar sesión y volver a entrar con "Iniciar sesión" (sin confirmar de nuevo)
- [ ] "¿Olvidaste tu contraseña?" → llega correo → abrir enlace → la app pide nueva contraseña → guardar → entrar con la nueva
- [ ] Abrir/cerrar la app varias veces: NO aparece ningún toast de "no se pudo conectar"

## 3. Metas y planes de ahorro
- [ ] Crear meta con fecha límite → aparece la sugerencia "Para llegar a tiempo: RD$X/mes" → botón Usar la aplica
- [ ] Aporte automático apagado por defecto en una meta nueva
- [ ] Plan "Reto": primer aporte + aumento → la vista previa muestra 50 → 75 → 100 → … y el total
- [ ] Frecuencia semanal → aparecen los chips L M M J V S D y se puede elegir el día
- [ ] Detalle de meta: anillo, estadísticas e historial de aportes visibles

## 4. Resto de lo entregado en 1.7.x
- [ ] Informes → resumen inteligente visible con datos del mes
- [ ] Calendario: montos completos en cada día (+30,000 / −7,500), no cortados
- [ ] Conversor: abre con USD arriba y monto 1
- [ ] Widget Balance → tocar abre CUENTAS (no el inicio)
- [ ] Widget Presupuestos → abre PRESUPUESTOS
- [ ] Widget Conversor → muestra tasas y al tocar abre el conversor
- [ ] Notificaciones in-app (toasts): colores por tipo, se pueden deslizar para cerrar
- [ ] Crear (+): deslizar horizontal cambia Gasto ↔ Ingreso ↔ Transferencia
- [ ] Movimientos recurrentes: el ícono 🔁 aparece en TODAS las ocurrencias
- [ ] Ajustes → Perfil de sonido: textos sin caracteres raros (vibración, más)

## 5. Humo general
- [ ] Crear gasto, ingreso y transferencia; editar y borrar uno
- [ ] Cambiar tema (oscuro/claro/AMOLED) con un sheet abierto: todo legible
- [ ] Versión en Ajustes coincide con la del build
- [ ] Backup manual a "Sharky Finance" funciona

---
**Si un punto falla:** captura + qué esperabas vs qué pasó. Con eso se corrige a la primera.
