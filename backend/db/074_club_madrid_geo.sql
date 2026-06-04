-- Padel Club Madrid: coordenadas para matchmaking por distancia (max_distance_km).
UPDATE public.clubs
SET lat = 40.5022, lng = -3.6916, updated_at = now()
WHERE id = '5768474f-b079-41f5-b1c8-1bc45c96b2c3'
  AND lat IS NULL;
