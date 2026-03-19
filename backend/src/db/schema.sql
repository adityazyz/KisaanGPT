-- AgriConnect Schema Migration
-- Run via: npm run db:migrate

-- ── Extensions ────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ── Enums ─────────────────────────────────────────────────────────────────
CREATE TYPE user_role AS ENUM ('farmer', 'buyer', 'supplier', 'admin');
CREATE TYPE plan_status AS ENUM ('draft', 'active', 'completed', 'cancelled');
CREATE TYPE supply_status AS ENUM ('pending', 'verified', 'aggregated', 'matched', 'sold');
CREATE TYPE lot_status AS ENUM ('open', 'matched', 'closed');
CREATE TYPE match_status AS ENUM ('proposed', 'accepted', 'rejected', 'completed');
CREATE TYPE quality_grade AS ENUM ('A', 'B', 'C', 'ungraded');

-- ── Users (synced from Clerk via webhook) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clerk_id      TEXT UNIQUE NOT NULL,
  email         TEXT UNIQUE NOT NULL,
  full_name     TEXT NOT NULL,
  phone         TEXT,
  role          user_role NOT NULL,
  is_active     BOOLEAN DEFAULT TRUE,
  avatar_url    TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_clerk_id ON users(clerk_id);
CREATE INDEX idx_users_role ON users(role);

-- ── Farms ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS farms (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  farmer_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  location      TEXT NOT NULL,
  state         TEXT NOT NULL,
  district      TEXT NOT NULL,
  latitude      NUMERIC(10,7),
  longitude     NUMERIC(10,7),
  area_acres    NUMERIC(10,2) NOT NULL,
  soil_type     TEXT,
  irrigation    TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_farms_farmer_id ON farms(farmer_id);
CREATE INDEX idx_farms_location ON farms(state, district);

-- ── Crop Plans ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crop_plans (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  farm_id           UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  farmer_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  crop_name         TEXT NOT NULL,
  variety           TEXT,
  season            TEXT NOT NULL,
  year              INT NOT NULL,
  status            plan_status DEFAULT 'draft',
  sowing_date       DATE,
  harvest_date      DATE,
  area_acres        NUMERIC(10,2),
  expected_yield_kg NUMERIC(12,2),
  notes             TEXT,
  ai_suggestions    JSONB,
  weather_alerts    JSONB DEFAULT '[]',
  timeline          JSONB DEFAULT '[]',
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_crop_plans_farmer_id ON crop_plans(farmer_id);
CREATE INDEX idx_crop_plans_farm_id ON crop_plans(farm_id);
CREATE INDEX idx_crop_plans_status ON crop_plans(status);

-- ── Production Records ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS production_records (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  crop_plan_id    UUID REFERENCES crop_plans(id) ON DELETE SET NULL,
  farm_id         UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  farmer_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  crop_name       TEXT NOT NULL,
  actual_yield_kg NUMERIC(12,2),
  system_estimate NUMERIC(12,2),
  harvest_date    DATE,
  quality_grade   quality_grade DEFAULT 'ungraded',
  notes           TEXT,
  images          JSONB DEFAULT '[]',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_production_farmer_id ON production_records(farmer_id);

-- ── Supply Lots ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS supply_lots (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  crop_name       TEXT NOT NULL,
  location        TEXT NOT NULL,
  state           TEXT NOT NULL,
  district        TEXT NOT NULL,
  total_qty_kg    NUMERIC(14,2) NOT NULL DEFAULT 0,
  available_qty   NUMERIC(14,2) NOT NULL DEFAULT 0,
  quality_grade   quality_grade DEFAULT 'ungraded',
  status          lot_status DEFAULT 'open',
  harvest_window_start DATE,
  harvest_window_end   DATE,
  price_per_kg    NUMERIC(10,2),
  admin_notes     TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_supply_lots_crop ON supply_lots(crop_name);
CREATE INDEX idx_supply_lots_location ON supply_lots(state, district);
CREATE INDEX idx_supply_lots_status ON supply_lots(status);

-- ── Supply Items (individual farmer contributions to lots) ────────────────
CREATE TABLE IF NOT EXISTS supply_items (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lot_id          UUID REFERENCES supply_lots(id) ON DELETE SET NULL,
  production_id   UUID REFERENCES production_records(id) ON DELETE SET NULL,
  farmer_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  crop_name       TEXT NOT NULL,
  qty_kg          NUMERIC(12,2) NOT NULL,
  quality_grade   quality_grade DEFAULT 'ungraded',
  status          supply_status DEFAULT 'pending',
  verified_at     TIMESTAMPTZ,
  verified_by     UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_supply_items_farmer_id ON supply_items(farmer_id);
CREATE INDEX idx_supply_items_lot_id ON supply_items(lot_id);

-- ── Buyer Demand ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS demand_posts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  buyer_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  crop_name       TEXT NOT NULL,
  quantity_kg     NUMERIC(14,2) NOT NULL,
  price_per_kg    NUMERIC(10,2),
  delivery_state  TEXT,
  delivery_district TEXT,
  required_by     DATE,
  quality_pref    quality_grade,
  notes           TEXT,
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_demand_buyer_id ON demand_posts(buyer_id);
CREATE INDEX idx_demand_crop ON demand_posts(crop_name);

-- ── Matches ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS matches (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  demand_id       UUID NOT NULL REFERENCES demand_posts(id) ON DELETE CASCADE,
  lot_id          UUID NOT NULL REFERENCES supply_lots(id) ON DELETE CASCADE,
  admin_id        UUID REFERENCES users(id),
  status          match_status DEFAULT 'proposed',
  matched_qty_kg  NUMERIC(14,2) NOT NULL,
  agreed_price    NUMERIC(10,2),
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_matches_demand_id ON matches(demand_id);
CREATE INDEX idx_matches_lot_id ON matches(lot_id);

-- ── Input Products (Supplier Marketplace) ────────────────────────────────
CREATE TABLE IF NOT EXISTS input_products (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  supplier_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  category        TEXT NOT NULL,
  description     TEXT,
  price           NUMERIC(10,2),
  unit            TEXT DEFAULT 'kg',
  stock_qty       NUMERIC(12,2),
  images          JSONB DEFAULT '[]',
  suitable_crops  TEXT[],
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_input_products_supplier_id ON input_products(supplier_id);
CREATE INDEX idx_input_products_category ON input_products(category);

-- ── Leads (farmer → supplier interest) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS leads (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id      UUID NOT NULL REFERENCES input_products(id) ON DELETE CASCADE,
  supplier_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  farmer_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message         TEXT,
  qty_needed      NUMERIC(12,2),
  is_read         BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_leads_supplier_id ON leads(supplier_id);
CREATE INDEX idx_leads_farmer_id ON leads(farmer_id);

-- ── Notifications ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  body            TEXT NOT NULL,
  type            TEXT NOT NULL,
  is_read         BOOLEAN DEFAULT FALSE,
  meta            JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notifications_user_id ON notifications(user_id, is_read);

-- ── Triggers: updated_at ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['users','farms','crop_plans','production_records',
    'supply_lots','supply_items','demand_posts','matches','input_products']
  LOOP
    EXECUTE format('
      CREATE TRIGGER trg_%I_updated_at
      BEFORE UPDATE ON %I
      FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t, t);
  END LOOP;
END $$;
