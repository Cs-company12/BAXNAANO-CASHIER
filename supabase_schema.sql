-- Supabase schema for the Bax Hospital / Lab / Doctor system
-- Replace YOUR_PROJECT and YOUR_ANON_KEY in hms.html with your Supabase project values.

-- Primary key-value table used by the browser app for remote persistence.
CREATE TABLE public.bax_app_data (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Optional normalized tables for future direct usage and better relational queries.
CREATE TABLE public.hosp_users (
  id text PRIMARY KEY,
  username text UNIQUE NOT NULL,
  password text NOT NULL,
  role text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.hosp_patients (
  id text PRIMARY KEY,
  patient_id text UNIQUE,
  patient_name text NOT NULL,
  mobile text,
  age text,
  sex text,
  address text,
  dob date,
  city text,
  region text,
  email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.hosp_appointments (
  id text PRIMARY KEY,
  appt_num text UNIQUE,
  queue_num integer,
  patient_id text REFERENCES public.hosp_patients(id),
  patient_name text,
  mobile text,
  age text,
  sex text,
  address text,
  doctor text,
  charge_type text,
  amount numeric(12,2),
  payment_method text,
  state text,
  appt_date date,
  appt_time text,
  patient_type text,
  notes text,
  cashier text,
  last_visit_date timestamptz,
  last_visit_doctor text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.hosp_prescriptions (
  id text PRIMARY KEY,
  appt_id text REFERENCES public.hosp_appointments(id),
  patient_id text REFERENCES public.hosp_patients(id),
  patient_name text,
  doctor text,
  medicine text,
  dose text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.hosp_followups (
  id text PRIMARY KEY,
  appt_id text REFERENCES public.hosp_appointments(id),
  patient_id text REFERENCES public.hosp_patients(id),
  patient_name text,
  phone text,
  doctor text,
  visit_date date,
  status text,
  message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.lab_products (
  id text PRIMARY KEY,
  name text NOT NULL,
  category text,
  price numeric(12,2),
  cost numeric(12,2),
  qty integer DEFAULT 0,
  expiry date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.lab_sales (
  id text PRIMARY KEY,
  receipt_no text UNIQUE,
  date timestamptz NOT NULL DEFAULT now(),
  customer text,
  items jsonb,
  total numeric(12,2),
  profit numeric(12,2),
  method text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.lab_results (
  id text PRIMARY KEY,
  report_no text UNIQUE,
  patient_id text REFERENCES public.hosp_patients(id),
  patient_name text,
  age integer,
  gender text,
  doctor text,
  tests jsonb,
  comment text,
  status text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_hosp_appointments_doctor ON public.hosp_appointments (doctor);
CREATE INDEX idx_lab_results_doctor ON public.lab_results (doctor);
CREATE INDEX idx_lab_sales_receipt_no ON public.lab_sales (receipt_no);
CREATE INDEX idx_hosp_patients_mobile ON public.hosp_patients (mobile);
