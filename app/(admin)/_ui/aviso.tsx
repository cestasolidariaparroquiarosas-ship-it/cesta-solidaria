import Link from "next/link";
import { AVISO } from "./estilos";

// Aviso de éxito tras una acción que redirige con ?aviso=clave. Solo se muestran textos
// fijos de un mapa: nunca se pinta lo que venga en la URL.
export function Aviso({ clave, textos }: { clave: unknown; textos: Record<string, string> }) {
  const texto = typeof clave === "string" && Object.hasOwn(textos, clave) ? textos[clave] : undefined;
  if (!texto) return null;
  return (
    <p role="status" className={`rounded-lg border px-3 py-2 text-sm font-medium ${AVISO.exito}`}>
      {texto}
    </p>
  );
}

export function Volver({ href, texto }: { href: string; texto: string }) {
  return (
    <Link href={href} className="text-sm font-medium text-emerald-800 hover:underline">
      ← {texto}
    </Link>
  );
}
