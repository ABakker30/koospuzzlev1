-- Physical build mode: mark solutions that were completed under gravity
-- protection and saved with a gravity-stable assembly order (placed_pieces
-- doubles as the physical placement table). Lets galleries and pickers
-- filter/rank physically buildable solutions.
alter table solutions
  add column if not exists is_physical boolean not null default false;

comment on column solutions.is_physical is
  'Solved in Physical build mode with a verified gravity-stable assembly order; placed_pieces is stored in that order.';
