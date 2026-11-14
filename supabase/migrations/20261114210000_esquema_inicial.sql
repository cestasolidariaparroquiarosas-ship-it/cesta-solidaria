-- Esquema inicial de la cesta solidaria (spec §3, plan PR 1).
--
-- Reglas que sigue este archivo y que deben seguir las migraciones futuras:
-- - Solo hacia delante y compatibles con la versión anterior del código.
-- - Row Level Security en todas las tablas. Solo los administradores
--   (app_metadata.rol = 'admin', igual que lib/rol.ts) pueden leer o escribir.
-- - El rol anon no tiene ningún permiso sobre las tablas: las páginas públicas
--   (/r/[token], /baja/[token]) leen y escriben desde el servidor con la clave secreta.
-- - Los estados se guardan como texto con CHECK, no como tipos ENUM: así se pueden
--   ampliar en una migración sin bloquear la versión anterior.
-- scripts/comprobar-rls.sql falla en CI si alguna tabla de public incumple las dos
-- primeras reglas.

-- ---------------------------------------------------------------------------
-- Funciones auxiliares (esquema privado: la API de Supabase no lo expone)
-- ---------------------------------------------------------------------------

create schema if not exists privado;
-- anon no lo necesita: no tiene permisos sobre ninguna tabla y las políticas son
-- solo para authenticated.
grant usage on schema privado to authenticated, service_role;

-- Supabase da por defecto EXECUTE a anon sobre las funciones nuevas de public.
-- Una función SECURITY DEFINER llamada por /rest/v1/rpc podría saltarse la RLS, así
-- que se quita ese permiso por defecto (scripts/comprobar-rls.sql lo vigila igualmente).
-- Hacen falta las dos órdenes: Postgres da EXECUTE a PUBLIC de forma global, y una
-- orden por esquema no puede quitar lo que se concede globalmente. Afecta a las
-- funciones que creen después las migraciones (rol postgres); las que deban poder
-- ejecutarse se conceden explícitamente, como es_admin() más abajo.
alter default privileges in schema public revoke execute on functions from anon;
alter default privileges revoke execute on functions from public;

-- Misma regla que lib/rol.ts: sesión no anónima con app_metadata.rol = 'admin'.
-- app_metadata solo se puede cambiar con la clave secreta o desde SQL.
create function privado.es_admin()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'rol', '') = 'admin'
     and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false;
$$;

revoke all on function privado.es_admin() from public;
grant execute on function privado.es_admin() to authenticated, service_role;

create function privado.tocar_actualizado_en()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.actualizado_en := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Colaboradores
-- ---------------------------------------------------------------------------

create table public.colaboradores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(trim(nombre)) > 0),
  email text not null check (email ~ '^[^@[:space:]]+@[^@[:space:]]+$'),
  telefono text,
  estado text not null default 'activo'
    check (estado in ('activo', 'pausado', 'baja')),
  pausado_hasta date,
  fecha_consentimiento timestamptz,
  notas text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

-- CA-01: un correo solo puede estar una vez, sin distinguir mayúsculas.
-- Ojo (RGPD): el error 23505 de este índice lleva el correo en `details`. La app lo
-- reconoce por `code` y nunca registra el objeto de error completo en los logs.
create unique index colaboradores_email_unico on public.colaboradores (lower(email));

comment on table public.colaboradores is
  'Datos personales (RGPD). "Eliminar definitivamente" borra la fila; sus asignaciones quedan con colaborador_id nulo ("Colaborador eliminado").';

-- ---------------------------------------------------------------------------
-- Catálogo: etiquetas de exclusión y alimentos
-- ---------------------------------------------------------------------------

-- Restricciones alimentarias, nunca religión ni salud (RGPD art. 9).
-- En una cesta se leen como "Sin <nombre>"; en un alimento, como "Contiene <nombre>".
create table public.etiquetas_exclusion (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique check (codigo ~ '^[a-z0-9_]+$'),
  nombre text not null check (length(trim(nombre)) > 0),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create table public.alimentos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(trim(nombre)) > 0),
  unidad text not null check (length(trim(unidad)) > 0),
  precio_aprox numeric(10, 2) not null check (precio_aprox >= 0),
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create unique index alimentos_nombre_unidad_unico
  on public.alimentos (lower(nombre), lower(unidad));

-- Qué etiquetas "contiene" cada alimento (N:M).
create table public.alimento_etiquetas (
  alimento_id uuid not null references public.alimentos (id) on delete cascade,
  etiqueta_id uuid not null references public.etiquetas_exclusion (id) on delete restrict,
  creado_en timestamptz not null default now(),
  primary key (alimento_id, etiqueta_id)
);

create index alimento_etiquetas_etiqueta on public.alimento_etiquetas (etiqueta_id);

-- ---------------------------------------------------------------------------
-- Listas base
-- ---------------------------------------------------------------------------

create table public.listas_base (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique check (length(trim(nombre)) > 0),
  predeterminada boolean not null default false,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

-- Como mucho una lista predeterminada.
create unique index listas_base_una_predeterminada
  on public.listas_base (predeterminada) where predeterminada;

-- Cantidades en unidades al mes, con decimales (R1.1).
create table public.lista_base_items (
  id uuid primary key default gen_random_uuid(),
  lista_base_id uuid not null references public.listas_base (id) on delete cascade,
  alimento_id uuid not null references public.alimentos (id) on delete restrict,
  cantidad_por_adulto numeric(8, 2) not null default 0 check (cantidad_por_adulto >= 0),
  cantidad_por_nino numeric(8, 2) not null default 0 check (cantidad_por_nino >= 0),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (lista_base_id, alimento_id)
);

create index lista_base_items_alimento on public.lista_base_items (alimento_id);

-- ---------------------------------------------------------------------------
-- Semanas y cestas
-- ---------------------------------------------------------------------------

create table public.semanas (
  id uuid primary key default gen_random_uuid(),
  fecha_entrega date not null unique,
  precio_base numeric(10, 2) not null check (precio_base > 0),
  plazo_confirmacion timestamptz not null,
  estado text not null default 'borrador'
    check (estado in ('borrador', 'enviada', 'cerrada')),
  -- Para la conservación a 12 meses (spec §10, pregunta 10).
  cerrada_en timestamptz,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  check ((estado = 'cerrada') = (cerrada_en is not null))
);

-- Del receptor solo se guarda un identificador (RGPD).
create table public.cestas (
  id uuid primary key default gen_random_uuid(),
  semana_id uuid not null references public.semanas (id) on delete cascade,
  identificador_receptor text not null check (length(trim(identificador_receptor)) > 0),
  adultos integer not null check (adultos >= 0),
  ninos integer not null check (ninos >= 0),
  lista_base_id uuid references public.listas_base (id) on delete set null,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  check (adultos + ninos > 0)
);

create index cestas_semana on public.cestas (semana_id);
create index cestas_lista_base on public.cestas (lista_base_id);

create table public.cesta_exclusiones (
  cesta_id uuid not null references public.cestas (id) on delete cascade,
  etiqueta_id uuid not null references public.etiquetas_exclusion (id) on delete restrict,
  creado_en timestamptz not null default now(),
  primary key (cesta_id, etiqueta_id)
);

create index cesta_exclusiones_etiqueta on public.cesta_exclusiones (etiqueta_id);

-- precio_unitario se copia del catálogo al crear la cesta (CA-08).
create table public.cesta_items (
  id uuid primary key default gen_random_uuid(),
  cesta_id uuid not null references public.cestas (id) on delete cascade,
  alimento_id uuid not null references public.alimentos (id) on delete restrict,
  cantidad integer not null check (cantidad > 0),
  precio_unitario numeric(10, 2) not null check (precio_unitario >= 0),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (cesta_id, alimento_id)
);

create index cesta_items_alimento on public.cesta_items (alimento_id);

-- ---------------------------------------------------------------------------
-- Ningún alimento de una cesta puede chocar con sus exclusiones (R1.3, CA-07).
-- La app lo comprueba antes de guardar; la base de datos lo garantiza también.
-- No se bloquea añadir una etiqueta a un alimento del catálogo: corregir el catálogo
-- tiene que ser posible siempre, y la pantalla de la cesta avisará del choque.
-- ---------------------------------------------------------------------------

create function privado.comprobar_item_sin_exclusiones()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.alimento_etiquetas ae
    join public.cesta_exclusiones ce on ce.etiqueta_id = ae.etiqueta_id
    where ae.alimento_id = new.alimento_id
      and ce.cesta_id = new.cesta_id
  ) then
    raise exception 'El alimento choca con las exclusiones de la cesta'
      using errcode = 'check_violation', hint = 'alimento_excluido';
  end if;
  return new;
end;
$$;

create trigger cesta_items_sin_exclusiones
  before insert on public.cesta_items
  for each row execute function privado.comprobar_item_sin_exclusiones();

-- En un UPDATE solo se comprueba si cambia el alimento o la cesta: cambiar la cantidad
-- de un alimento que ya estaba no debe fallar aunque el catálogo haya cambiado después.
create trigger cesta_items_sin_exclusiones_al_cambiar
  before update on public.cesta_items
  for each row
  when (old.alimento_id is distinct from new.alimento_id
        or old.cesta_id is distinct from new.cesta_id)
  execute function privado.comprobar_item_sin_exclusiones();

create function privado.comprobar_exclusion_sin_items()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.cesta_items ci
    join public.alimento_etiquetas ae on ae.alimento_id = ci.alimento_id
    where ci.cesta_id = new.cesta_id
      and ae.etiqueta_id = new.etiqueta_id
  ) then
    raise exception 'La cesta ya tiene alimentos que chocan con esa exclusión'
      using errcode = 'check_violation', hint = 'alimento_excluido';
  end if;
  return new;
end;
$$;

create trigger cesta_exclusiones_sin_items
  before insert on public.cesta_exclusiones
  for each row execute function privado.comprobar_exclusion_sin_items();

create trigger cesta_exclusiones_sin_items_al_cambiar
  before update on public.cesta_exclusiones
  for each row
  when (old.etiqueta_id is distinct from new.etiqueta_id
        or old.cesta_id is distinct from new.cesta_id)
  execute function privado.comprobar_exclusion_sin_items();

-- ---------------------------------------------------------------------------
-- Asignaciones
-- ---------------------------------------------------------------------------

create table public.asignaciones (
  id uuid primary key default gen_random_uuid(),
  semana_id uuid not null references public.semanas (id) on delete cascade,
  -- Nulo tras "Eliminar definitivamente" al colaborador (R5.2, CA-04).
  colaborador_id uuid references public.colaboradores (id) on delete set null,
  estado text not null default 'propuesta'
    check (estado in ('propuesta', 'pendiente', 'confirmada', 'rechazada', 'sin_respuesta')),
  -- 32 bytes aleatorios. Solo se usa en los enlaces del correo (R4).
  token text not null unique default encode(extensions.gen_random_bytes(32), 'hex'),
  plazo timestamptz,
  enviado_en timestamptz,
  respondido_en timestamptz,
  entregado boolean not null default false,
  sustituye_a uuid references public.asignaciones (id) on delete set null,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  -- enviado_en no se exige en 'pendiente': la reasignación se guarda antes de enviar
  -- el correo, y si el envío falla el cron lo reintenta (plan §4).
  check (estado not in ('confirmada', 'rechazada') or respondido_en is not null),
  -- Sin plazo, el cron nunca la daría por vencida (R4.5, CA-20).
  check (estado <> 'pendiente' or plazo is not null)
);

-- Un colaborador tiene como mucho una asignación por semana, también si la rechazó
-- (R4.4: el sustituto es alguien que no tenga asignación esa semana). Además impide
-- que dos rechazos simultáneos elijan al mismo sustituto (plan §4).
create unique index asignaciones_colaborador_semana
  on public.asignaciones (semana_id, colaborador_id) where colaborador_id is not null;

create index asignaciones_colaborador on public.asignaciones (colaborador_id);
create index asignaciones_sustituye_a on public.asignaciones (sustituye_a);
-- Para el cron diario (R4.5).
create index asignaciones_pendientes_plazo
  on public.asignaciones (plazo) where estado = 'pendiente';

create table public.asignacion_items (
  id uuid primary key default gen_random_uuid(),
  asignacion_id uuid not null references public.asignaciones (id) on delete cascade,
  -- NO ACTION (no CASCADE): quitar de una cesta un alimento que ya tiene colaborador
  -- falla, para que la app lo trate a propósito y el histórico no cambie en silencio.
  -- Borrar la semana entera sí funciona: las dos cascadas ocurren en la misma sentencia.
  cesta_item_id uuid not null references public.cesta_items (id) on delete no action,
  cantidad integer not null check (cantidad > 0),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (asignacion_id, cesta_item_id)
);

create index asignacion_items_cesta_item on public.asignacion_items (cesta_item_id);

-- ---------------------------------------------------------------------------
-- Registro de eventos (auditoría de envíos, respuestas y reasignaciones).
-- Nunca se guardan nombres ni correos en detalle.
-- ---------------------------------------------------------------------------

create table public.registro_eventos (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (length(trim(tipo)) > 0),
  -- set null: la auditoría se conserva aunque se borre la semana.
  semana_id uuid references public.semanas (id) on delete set null,
  asignacion_id uuid references public.asignaciones (id) on delete set null,
  detalle jsonb not null default '{}'::jsonb,
  fecha timestamptz not null default now(),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create index registro_eventos_semana on public.registro_eventos (semana_id, fecha);
create index registro_eventos_asignacion on public.registro_eventos (asignacion_id);

-- ---------------------------------------------------------------------------
-- actualizado_en, RLS y permisos en todas las tablas
-- ---------------------------------------------------------------------------

do $$
declare
  tabla text;
begin
  foreach tabla in array array[
    'colaboradores', 'etiquetas_exclusion', 'alimentos', 'listas_base',
    'lista_base_items', 'semanas', 'cestas', 'cesta_items', 'asignaciones',
    'asignacion_items', 'registro_eventos'
  ] loop
    execute format(
      'create trigger tocar_actualizado_en before update on public.%I
         for each row execute function privado.tocar_actualizado_en()', tabla);
  end loop;

  foreach tabla in array array[
    'colaboradores', 'etiquetas_exclusion', 'alimentos', 'alimento_etiquetas',
    'listas_base', 'lista_base_items', 'semanas', 'cestas', 'cesta_exclusiones',
    'cesta_items', 'asignaciones', 'asignacion_items', 'registro_eventos'
  ] loop
    execute format('alter table public.%I enable row level security', tabla);
    execute format('revoke all on public.%I from anon', tabla);
    execute format(
      'create policy solo_administradores on public.%I
         for all to authenticated
         using ((select privado.es_admin()))
         with check ((select privado.es_admin()))', tabla);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Datos iniciales que necesita también producción (seed.sql solo corre en local).
-- ---------------------------------------------------------------------------

insert into public.etiquetas_exclusion (codigo, nombre) values
  ('cerdo', 'cerdo'),
  ('gluten', 'gluten'),
  ('lactosa', 'lactosa'),
  ('frutos_secos', 'frutos secos'),
  ('huevo', 'huevo')
on conflict (codigo) do nothing;
