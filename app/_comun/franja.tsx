import { IconoCesta } from "@/app/(admin)/_ui/iconos";

/**
 * Franja verde con el nombre, para el acceso y las páginas de los enlaces del correo
 * (spec 0003 §2, decisión 3). Sin enlaces: las páginas públicas no llevan a ninguna otra.
 */
export function Franja() {
  return (
    <div className="bg-emerald-900 text-white">
      <p className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-3 text-lg font-bold">
        <IconoCesta className="size-6 text-emerald-300" />
        Cesta solidaria
      </p>
    </div>
  );
}
