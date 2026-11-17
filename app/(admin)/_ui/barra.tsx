/**
 * Barra de tramos de color (respuestas, gasto). Es una imagen para el lector de pantalla:
 * `texto` dice lo mismo que los colores.
 */
export function BarraProporcion({
  tramos,
  total,
  texto,
  alto = "h-2.5",
}: {
  tramos: { valor: number; clase: string }[];
  /** Lo que vale la barra entera. Por defecto, la suma de los tramos. */
  total?: number;
  texto: string;
  alto?: string;
}) {
  const suma = tramos.reduce((t, x) => t + x.valor, 0);
  const base = Math.max(total ?? suma, suma, 0);
  return (
    <div role="img" aria-label={texto} className={`flex w-full overflow-hidden rounded-full bg-stone-200 ${alto}`}>
      {base > 0 &&
        tramos
          .filter((x) => x.valor > 0)
          .map((x, i) => <div key={i} className={x.clase} style={{ width: `${(x.valor / base) * 100}%` }} />)}
    </div>
  );
}
