"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

const SECCIONES = [
  { href: "/", nombre: "Inicio" },
  { href: "/semanas", nombre: "Semanas" },
  { href: "/historico", nombre: "Histórico" },
  { href: "/colaboradores", nombre: "Colaboradores" },
  { href: "/alimentos", nombre: "Alimentos" },
  { href: "/listas", nombre: "Listas base" },
] as const;

/** La sección de una ruta: también en sus subpáginas (`/semanas/…/reparto` → Semanas). */
export function seccionActual(ruta: string): string | undefined {
  if (ruta === "/") return "/";
  return SECCIONES.find((s) => s.href !== "/" && (ruta === s.href || ruta.startsWith(`${s.href}/`)))?.href;
}

/**
 * Menú de secciones (spec 0003 §2, CA-0301 y CA-0305). En el móvil es una sola fila que
 * se desliza dentro de la cabecera; la sección actual se pone a la vista al cargar.
 */
export function Menu() {
  const ruta = usePathname();
  const actual = seccionActual(ruta);
  const activo = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    const nav = activo.current?.parentElement;
    if (!nav || !activo.current) return;
    // Solo el desplazamiento horizontal de la fila: nunca mueve la página.
    const enlace = activo.current;
    if (
      enlace.offsetLeft + enlace.offsetWidth > nav.scrollLeft + nav.clientWidth ||
      enlace.offsetLeft < nav.scrollLeft
    ) {
      nav.scrollLeft = enlace.offsetLeft - 16;
    }
  }, [actual]);

  return (
    <nav
      aria-label="Secciones"
      className="relative flex gap-1 overflow-x-auto px-4 pb-1 whitespace-nowrap sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0"
    >
      {SECCIONES.map((s) => {
        const esActual = s.href === actual;
        return (
          <Link
            key={s.href}
            href={s.href}
            ref={esActual ? activo : undefined}
            aria-current={esActual ? "page" : undefined}
            className={`rounded-lg px-3 py-2.5 text-[15px] font-medium sm:py-2 ${
              esActual ? "bg-white text-emerald-900" : "text-emerald-50 hover:bg-emerald-800 hover:text-white"
            }`}
          >
            {s.nombre}
          </Link>
        );
      })}
    </nav>
  );
}
