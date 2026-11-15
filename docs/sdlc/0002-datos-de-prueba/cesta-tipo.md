# Cesta tipo: Excel de los administradores frente a la app

La app calcula cada cantidad como **adultos × "por adulto" + niños × "por niño"**, redondeando hacia arriba (R1). El Excel da una cantidad fija por tramo de familia. Para cada producto se ha elegido el "por adulto" y el "por niño" que más se acercan al Excel. El método está en el spec, §2.

Cómo leer la tabla:
- **Un número solo:** la app da lo mismo que el Excel.
- **«2 → 2/3»:** el Excel dice 2 y la app da 2 o 3, según la composición de la familia dentro del tramo:

  | Tramo | Composiciones |
  |---|---|
  | 1-2 personas | 1 o 2 adultos |
  | 3-4 personas | 2 adultos con 1 o 2 niños |
  | Más de 5 | 2 adultos y 4 niños, o 3 y 3 |

Generada con `scripts/datos-de-prueba/ajuste.ts`.

| Producto | Por adulto | Por niño | 1-2 personas | 1 adulto + 1 niño | 3-4 personas | 5 personas | Más de 5 |
|---|---|---|---|---|---|---|---|
| Leche entera | 1,25 | 0,25 | 2 → **2/3** | 2 | 3 | 4 | 4 → **4/5** |
| Margarina | 0,25 | 0 | 1 | 1 | 1 | 1 | 1 |
| Mermelada | 0,25 | 0 | 1 | 1 | 1 | 1 | 1 |
| Pan de molde | 0,75 | 0 | 2 → **1/2** | 1 | 2 | 2 | 2 → **2/3** |
| Yogures de frutas | 0,5 | 0,25 | 1 | 1 | 2 | 2 | 2 → **2/3** |
| Café molido | 0,25 | 0 | 1 | 1 | 1 | 1 | 1 |
| Galletas | 0,5 | 0,75 | 1 | 2 | 3 → **2/3** | 4 | 4 |
| Cereales | 0 | 0,5 | 0 | 2 → **1** | 2 → **1/1** | 2 | 2 |
| Cacao soluble | 0 | 0,25 | 0 | 1 | 1 | 1 | 1 |
| Azúcar | 0,25 | 0 | 1 | 1 | 1 | 1 | 1 |
| Harina de trigo | 0,25 | 0 | 1 | 1 | 1 | 1 | 1 |
| Aceite de oliva | 0,25 | 0 | 1 | 1 | 1 | 1 | 1 |
| Aceite de girasol | 0,25 | 0 | 1 | 1 | 1 | 1 | 1 |
| Zanahorias | 0,25 | 0 | 1 | 1 | 1 | 1 | 1 |
| Cebollas | 0,25 | 0 | 1 | 1 | 1 | 1 | 1 |
| Tomate natural triturado | 0,5 | 0,25 | 1 | 1 | 2 | 2 | 2 → **2/3** |
| Tomate frito | 0,5 | 0,25 | 1 | 1 | 2 | 2 | 2 → **2/3** |
| Verduras en conserva | 1,25 | 1 | 3 → **2/3** | 4 → **3** | 5 → **4/5** | 7 → **6** | 7 |
| Garbanzos | 0,25 | 0 | 1 | 1 | 1 | 1 | 1 |
| Judías blancas o pintas | 0,25 | 0 | 1 | 1 | 1 | 1 | 1 |
| Lentejas | 0,25 | 0 | 1 | 1 | 1 | 1 | 1 |
| Fideos | 0,25 | 0 | 1 | 1 | 1 | 1 | 1 |
| Macarrones | 0,5 | 0,25 | 1 | 2 → **1** | 2 | 2 | 2 → **2/3** |
| Arroz | 0,5 | 0,25 | 1 | 2 → **1** | 2 | 2 | 2 → **2/3** |
| Fuet | 0,5 | 0,25 | 1 | 1 | 2 | 2 | 2 → **2/3** |
| Jamón cocido | 0,25 | 0 | 1 | 1 | 1 | 1 | 1 |
| Queso en lonchas | 0,5 | 0,5 | 1 | 2 → **1** | 2 | 3 | 3 |
| Atún en aceite | 0,75 | 0,25 | 2 → **1/2** | 2 → **1** | 2 | 3 | 3 |
| Sardinas en aceite | 0,75 | 0 | 2 → **1/2** | 2 → **1** | 2 | 2 | 3 → **2/3** |
| Fruta del tiempo | 0,75 | 0 | 2 → **1/2** | 2 → **1** | 2 | 2 | 3 → **2/3** |
| Fruta en almíbar | 0,25 | 0 | 1 | 1 | 1 | 1 | 1 |
| Patatas | 0,25 | 0 | 1 | 1 | 1 | 1 | 1 |
| Lavavajillas a mano | 0,25 | 0 | 1 | 1 | 1 | 1 | 1 |
| Limpiador multiusos | 0,25 | 0 | 1 | 1 | 1 | 1 | 1 |
| Gel de ducha | 0,25 | 0 | 1 | 1 | 1 | 1 | 1 |
| Champú | 0,25 | 0 | 1 | 1 | 1 | 1 | 1 |
| Papel higiénico | 0,25 | 0 | 1 | 1 | 1 | 1 | 1 |
| Dentífrico | 0,25 | 0 | 1 | 1 | 1 | 1 | 1 |
| Sal | 0,25 | 0 | 1 | 1 | 1 | 1 | 1 |
