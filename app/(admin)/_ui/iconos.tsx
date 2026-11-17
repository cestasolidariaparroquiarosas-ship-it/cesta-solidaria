// Iconos de trazo en línea. Son decoración: el texto de al lado dice lo mismo.

type Props = { className?: string };

function Icono({ className = "size-5", children }: Props & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`shrink-0 ${className}`}
    >
      {children}
    </svg>
  );
}

export function IconoCesta(p: Props) {
  return (
    <Icono {...p}>
      <path d="M3 10h18l-2 10H5L3 10z" />
      <path d="M8 10l4-6 4 6" />
      <path d="M9 14v3M15 14v3M12 14v3" />
    </Icono>
  );
}

export function IconoCheck(p: Props) {
  return (
    <Icono {...p}>
      <path d="M5 12l5 5L20 7" />
    </Icono>
  );
}

export function IconoReloj(p: Props) {
  return (
    <Icono {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </Icono>
  );
}

export function IconoCruz(p: Props) {
  return (
    <Icono {...p}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Icono>
  );
}

export function IconoAtencion(p: Props) {
  return (
    <Icono {...p}>
      <path d="M12 3l9 16H3l9-16z" />
      <path d="M12 10v4M12 17h.01" />
    </Icono>
  );
}

export function IconoInfo(p: Props) {
  return (
    <Icono {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </Icono>
  );
}
