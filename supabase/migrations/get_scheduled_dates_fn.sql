-- Function: get_scheduled_dates
-- Returns distinct dates that have at least one slot configured for a club within a date range.
-- Used by the calendar endpoint to compute has_schedule efficiently.

CREATE OR REPLACE FUNCTION public.get_scheduled_dates(
    p_club_id uuid,
    p_first   date,
    p_last    date
)
RETURNS TABLE(scheduled_date date)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT DISTINCT date AS scheduled_date
    FROM public.club_day_schedule
    WHERE club_id = p_club_id
      AND date >= p_first
      AND date <= p_last;
$$;
