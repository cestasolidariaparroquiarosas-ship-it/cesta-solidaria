# Guía de uso de la cesta solidaria

Esta guía es para quien organiza la cesta. Explica el trabajo de cada semana y qué hace la app sola. La parte técnica (cuentas, despliegues, copias) está en `docs/operacion.md`.

**Dirección de la app:** https://cesta-solidaria-rosas.vercel.app. Se entra con el correo y la contraseña de administrador. Funciona igual en el móvil.

## La idea en una frase

Cada semana preparas las cestas de las familias, la app propone qué colaboradores las pagan y qué compra cada uno, les manda un correo, y ellos confirman o dicen que no pueden. Si alguien no puede, la app busca sola a otra persona.

## Antes de empezar (una sola vez)

1. **Alimentos:** el catálogo de lo que se suele poner en las cestas. Para cada alimento se anotan:
   - la **unidad** en que se compra ("paquete 1 kg", "lata 400 g"…);
   - un **precio aproximado**, que sirve para repartir el gasto de forma equilibrada;
   - sus **etiquetas de exclusión**, si las tiene ("contiene cerdo", "contiene gluten"…).

   Las etiquetas se crean en Alimentos → Etiquetas de exclusión. Son siempre **alimentarias**: nunca se anota religión ni salud.
2. **Listas base:** cuánto de cada alimento corresponde **por adulto** y **por niño**. La lista marcada como predeterminada es la que se usa al crear una cesta.
3. **Colaboradores:** nombre, correo y, si hace falta, notas. Solo se da de alta a quien **ha dado su consentimiento** (hay que marcar la casilla). Las notas son solo para organizar: nada de salud ni religión.

## Cada semana

En **Semanas → Nueva semana** se crea la semana con su **fecha de entrega** y el **precio base**, que es lo que se pide gastar a cada colaborador, más o menos. Dentro de la semana hay cuatro pasos:

### 1. Datos
La fecha de entrega y el precio base. Se pueden cambiar mientras no se hayan enviado los correos.

### 2. Cestas
Una cesta por familia, con:
- un **identificador** ("Familia 12"): nunca el nombre ni datos personales;
- cuántos **adultos** y **niños** hay;
- sus **exclusiones** ("sin cerdo").

La app propone los alimentos con la lista base y quita los que chocan con las exclusiones (y avisa de cuáles ha quitado). Después puedes cambiar cantidades, quitar o añadir alimentos. La app no deja añadir algo que choque con las exclusiones de esa cesta.

### 3. Reparto
Pulsa **Proponer reparto**. La app:
- calcula cuántos colaboradores hacen falta: el coste total dividido entre el precio base, redondeando hacia arriba;
- elige primero a quienes **hace más tiempo que no participan** (o nunca lo han hecho). No elige a quien está en pausa ni a quien se ha dado de baja;
- reparte los alimentos para que todos gasten lo más parecido posible.

Si hay menos colaboradores disponibles de los necesarios, reparte entre los que hay y avisa de que alguno gastará más del precio base. Puedes mover alimentos de una persona a otra o cambiar a un colaborador por otro. **Volver a proponer el reparto** deshace los cambios hechos a mano.

### 4. Envío y respuestas
Pulsa **Enviar los correos**. La app propone un plazo para responder: 48 horas, o hasta la víspera de la entrega a las 23:59 si eso llega antes. Puedes cambiarlo antes de enviar.

Cada colaborador recibe **un solo correo** con su lista, el plazo y dos enlaces:
- **Responder:** abre una página donde pulsa **Confirmar** o **No puedo**. Solo abrir el enlace no cambia nada; hay que pulsar el botón.
- **Darse de baja:** deja de recibir correos de la cesta.

En esta misma pantalla ves cómo va cada uno: pendiente, confirmada, no puede, sin respuesta… Cuando alguien entregue sus alimentos, marca **Marcar como entregado**.

## Lo que hace la app sola

- **Si alguien pulsa "No puedo":** la app pasa sus alimentos al siguiente colaborador disponible y le envía el correo en ese momento.
- **Cada mañana** (hacia las 8:00 en invierno y las 9:00 en verano, hora de España):
  - quien no ha respondido dentro del plazo queda como "sin respuesta", y sus alimentos pasan a otra persona;
  - vuelve a intentar los correos que no salieron;
  - cierra las semanas cuya entrega fue hace 7 días o más;
  - cuando han pasado 12 meses, cambia los identificadores de las cestas antiguas por "Cesta n.º X";
  - hace una consulta a la base de datos para que el servicio gratuito no la pause.
- **Si no queda nadie para sustituir** a quien no puede, te llega un correo de aviso. Si consigues a alguien más (das de alta a un colaborador nuevo o reactivas a uno en pausa), pulsa **Buscar sustituto** en la pantalla de envío: la app le pasa los alimentos y le manda el correo.
- **Cada noche** se hace una copia de seguridad cifrada de todos los datos, y se comprueba que se puede restaurar (ver `docs/operacion.md`).

## Cerrar la semana

Cuando la entrega ha pasado, pulsa **Cerrar la semana**. Quien siga sin responder queda como "sin respuesta" y la semana pasa al **Histórico**, donde se ve quién llevó qué. Si se te olvida, la app la cierra sola a los 7 días. Mientras tanto, en Inicio aparece en **Falta cerrar**.

## Inicio

Resume la semana en curso (cuántos han confirmado y cuántos faltan) y dice qué toca hacer: añadir cestas, preparar el reparto, enviar, marcar lo entregado y cerrar. También avisa de los problemas: un correo que no ha salido, alguien que no puede y nadie lleva lo suyo, o semanas que faltan por cerrar. En la sección **Correo** puedes **enviar un correo de prueba** a tu dirección para comprobar que el envío funciona.

## Colaboradores: pausas, bajas y borrado

- **En pausa:** para quien no puede durante un tiempo. Si pones fecha de vuelta, volverá a salir en las semanas con entrega posterior a esa fecha. Si la dejas vacía, sigue en pausa hasta que pulses **Reactivar**.
- **Baja:** no vuelve a ser elegido ni recibe correos. Pasa al pulsar el enlace de baja del correo, o cuando tú lo marcas.
- **Eliminar definitivamente:** borra su nombre y su correo de la base de datos, y no se puede deshacer. En el histórico aparece como "Colaborador eliminado". Úsalo si alguien pide que se borren sus datos.

## Protección de datos, en corto

- De las familias solo se guarda un identificador, el número de adultos y niños, y exclusiones alimentarias.
- De los colaboradores, el nombre, el correo y lo que hacen en la cesta, y solo con su consentimiento.
- Las páginas de los enlaces del correo solo muestran el nombre de pila, la fecha y los alimentos de esa persona.
- Los correos llevan un pie de protección de datos y el enlace de baja.

## Si algo va mal

| Qué pasa | Qué hacer |
|---|---|
| No puedes entrar | Comprueba el correo y la contraseña. Si acabas de recibir una versión nueva, recarga la página |
| Los correos no llegan | En Inicio → Correo, envía uno de prueba. Si falla, puede que haya cambiado la contraseña de Gmail: hay que crear otra contraseña de aplicación (ver `docs/operacion.md`) |
| Te llega un aviso de GitHub de que algo ha fallado | Pásaselo a Claude con el enlace: dirá qué ha pasado y cómo arreglarlo |
| Un cambio nuevo ha estropeado algo | Se puede volver a la versión anterior en segundos (ver `docs/operacion.md`, "Volver a una versión anterior") |
| Se han dañado o borrado datos | Hay copias de los últimos 30 días (ver `docs/operacion.md`, "Restaurar una copia de seguridad") |
