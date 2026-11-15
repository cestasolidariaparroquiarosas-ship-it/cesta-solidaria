"use client";

// Si algo falla al guardar una respuesta o una baja, un mensaje claro en lugar de la
// página de error de Next.js (en inglés). No se muestra el detalle del error.
export default function ErrorPublico({ reset }: { error: Error; reset: () => void }) {
  return (
    <div role="alert" className="flex flex-col gap-3">
      <h1 className="text-xl font-semibold">No se ha podido guardar</h1>
      <p>Ha habido un problema. Inténtalo otra vez dentro de un rato o, si lo prefieres, contesta al correo.</p>
      <div>
        <button
          type="button"
          onClick={reset}
          className="rounded-md border border-stone-300 px-4 py-2 font-medium hover:bg-stone-50"
        >
          Volver a intentarlo
        </button>
      </div>
    </div>
  );
}
