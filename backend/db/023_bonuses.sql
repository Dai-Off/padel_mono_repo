-- 023_bonuses.sql
-- Tabla de bonos configurables por club

CREATE TABLE IF NOT EXISTS bonuses (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    club_id         UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    name            VARCHAR(120) NOT NULL,
    description     TEXT,
    category        VARCHAR(40) NOT NULL DEFAULT 'monedero',
    price_to_pay    INTEGER NOT NULL,          -- céntimos que paga el cliente
    balance_to_add  INTEGER NOT NULL,          -- céntimos que se inyectan en wallet
    physical_item   VARCHAR(200),              -- ej: "Bote de pelotas"
    validity_days   INTEGER,                   -- días de vigencia tras compra (NULL = sin caducidad)
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índice para listar bonos de un club rápidamente
CREATE INDEX IF NOT EXISTS idx_bonuses_club_id ON bonuses(club_id);

-- Trigger para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_bonuses_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_bonuses_updated_at ON bonuses;
CREATE TRIGGER trg_bonuses_updated_at
    BEFORE UPDATE ON bonuses
    FOR EACH ROW EXECUTE FUNCTION update_bonuses_updated_at();
