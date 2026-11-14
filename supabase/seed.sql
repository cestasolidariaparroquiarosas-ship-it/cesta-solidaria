-- Datos de ejemplo para desarrollo local y CI (npx supabase db reset).
-- No se cargan en pruebas ni en producción: allí el administrador da de alta su propio
-- catálogo. Las etiquetas de exclusión están en la migración inicial porque producción
-- también las necesita.
-- No hay colaboradores de ejemplo: las pruebas de selección (R2) crean los suyos y
-- necesitan saber exactamente quién es candidato.

insert into public.alimentos (nombre, unidad, precio_aprox) values
  ('Arroz', 'paquete 1 kg', 1.20),
  ('Lentejas', 'paquete 1 kg', 1.80),
  ('Garbanzos cocidos', 'bote 400 g', 0.90),
  ('Pasta', 'paquete 500 g', 0.80),
  ('Tomate triturado', 'lata 400 g', 0.70),
  ('Atún en aceite', 'pack 3 latas', 3.20),
  ('Aceite de oliva', 'botella 1 l', 7.50),
  ('Leche', 'brik 1 l', 0.95),
  ('Galletas', 'paquete 800 g', 1.50),
  ('Huevos', 'docena', 2.60),
  ('Azúcar', 'paquete 1 kg', 1.10),
  ('Chorizo', 'pieza 200 g', 2.50),
  ('Pan de molde', 'paquete', 1.60)
on conflict do nothing;

insert into public.alimento_etiquetas (alimento_id, etiqueta_id)
select a.id, e.id
from (values
  ('Leche', 'lactosa'),
  ('Galletas', 'gluten'),
  ('Galletas', 'lactosa'),
  ('Pasta', 'gluten'),
  ('Huevos', 'huevo'),
  ('Chorizo', 'cerdo'),
  ('Pan de molde', 'gluten')
) as v (alimento, etiqueta)
join public.alimentos a on a.nombre = v.alimento
join public.etiquetas_exclusion e on e.codigo = v.etiqueta
on conflict do nothing;

insert into public.listas_base (nombre, predeterminada) values
  ('Familia estándar', true)
on conflict do nothing;

-- Unidades al mes por adulto y por niño. El arroz coincide con el ejemplo de CA-05.
insert into public.lista_base_items (lista_base_id, alimento_id, cantidad_por_adulto, cantidad_por_nino)
select l.id, a.id, v.por_adulto, v.por_nino
from (values
  ('Arroz', 1.5, 1),
  ('Lentejas', 0.5, 0.5),
  ('Garbanzos cocidos', 2, 1),
  ('Pasta', 2, 1),
  ('Tomate triturado', 2, 1),
  ('Atún en aceite', 1, 0.5),
  ('Aceite de oliva', 0.5, 0),
  ('Leche', 4, 6),
  ('Galletas', 1, 1),
  ('Huevos', 0.5, 0.5),
  ('Azúcar', 0.5, 0),
  ('Chorizo', 0.5, 0)
) as v (alimento, por_adulto, por_nino)
join public.alimentos a on a.nombre = v.alimento
join public.listas_base l on l.nombre = 'Familia estándar'
on conflict do nothing;
