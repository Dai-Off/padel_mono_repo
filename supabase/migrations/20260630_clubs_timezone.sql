-- Zona horaria por club (IANA). No forzamos una zona fija: se deriva del país
-- declarado en el alta. La grilla y la validación de horarios usan esta columna.
alter table public.clubs add column if not exists timezone text;

-- Backfill desde el país de la solicitud de alta vinculada (club_applications.country).
update public.clubs c
set timezone = case
    lower(
      trim(
        translate(
          a.country,
          'ÁÉÍÓÚÜÑáéíóúüñÀÈÌÒÙàèìòù',
          'AEIOUUNaeiouunAEIOUaeiou'
        )
      )
    )
    when 'espana' then 'Europe/Madrid'
    when 'spain' then 'Europe/Madrid'
    when 'mexico' then 'America/Mexico_City'
    when 'argentina' then 'America/Argentina/Buenos_Aires'
    when 'chile' then 'America/Santiago'
    when 'colombia' then 'America/Bogota'
    when 'peru' then 'America/Lima'
    when 'ecuador' then 'America/Guayaquil'
    when 'uruguay' then 'America/Montevideo'
    when 'portugal' then 'Europe/Lisbon'
    when 'italia' then 'Europe/Rome'
    when 'italy' then 'Europe/Rome'
    when 'francia' then 'Europe/Paris'
    when 'france' then 'Europe/Paris'
    when 'alemania' then 'Europe/Berlin'
    when 'germany' then 'Europe/Berlin'
    when 'reino unido' then 'Europe/London'
    when 'united kingdom' then 'Europe/London'
    when 'suecia' then 'Europe/Stockholm'
    when 'sweden' then 'Europe/Stockholm'
    when 'paises bajos' then 'Europe/Amsterdam'
    when 'netherlands' then 'Europe/Amsterdam'
    when 'eau' then 'Asia/Dubai'
    when 'emiratos arabes unidos' then 'Asia/Dubai'
    when 'qatar' then 'Asia/Qatar'
    else null
  end
from public.club_applications a
where a.club_id = c.id
  and c.timezone is null;

-- Clubes sin país reconocido conservan el comportamiento previo (Europe/Madrid).
update public.clubs set timezone = 'Europe/Madrid' where timezone is null;
