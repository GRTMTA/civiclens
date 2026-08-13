insert into public.projects (
  id, source, source_url, name, category, description, agency, contractor,
  budget, status, progress, location, coordinates, documents
) values (
  'dpwh-23HH0042',
  'DPWH Transparency Portal',
  'https://transparency.dpwh.gov.ph/',
  'Construction of Babag Health Center and Wellness Camp',
  'facility',
  'Construction of a public health facility in Cebu City.',
  'Department of Public Works and Highways',
  'Corro Construction',
  18500000,
  'In progress',
  72,
  'Babag, Cebu City',
  extensions.st_setsrid(extensions.st_makepoint(123.905, 10.325), 4326)::extensions.geography,
  '[]'::jsonb
) on conflict (id) do nothing;
