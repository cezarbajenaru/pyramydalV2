SET search_path TO app, public;

TRUNCATE TABLE app.main_rows RESTART IDENTITY CASCADE;
TRUNCATE TABLE app.lista_programe RESTART IDENTITY CASCADE;
TRUNCATE TABLE app.price_list RESTART IDENTITY CASCADE;

INSERT INTO app.lista_programe (
  reper, client, indice, soft_folosit, utilaj, programator, locatie_dosar, timpi_masinare
)
VALUES
  ('REP-0001', 'CLIENT-1', '-', 'PowerMill', 'HURCO', 'seed-user', '/seed/rep-1', 0.5),
  ('REP-0002', 'CLIENT-2', '-', 'Fusion', 'MATEC', 'seed-user', '/seed/rep-2', 1.2);

INSERT INTO app.price_list (
  reper, client, pret_per_buc, moneda, valabil_de_la
)
VALUES
  ('REP-0001', 'CLIENT-1', 120.00, 'EUR', CURRENT_DATE),
  ('REP-0002', 'CLIENT-2', 200.00, 'EUR', CURRENT_DATE);

INSERT INTO app.main_rows (
  nr_fisa, reper, client, buc, created_by, updated_by, status
)
VALUES
  ('FISA-00001', 'REP-0001', 'CLIENT-1', 10, 'seed', 'seed', 'in_lucru'),
  ('FISA-00002', 'REP-0002', 'CLIENT-2', 4, 'seed', 'seed', 'in_lucru');
