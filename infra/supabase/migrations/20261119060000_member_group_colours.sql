ALTER TABLE public.member_groups
ADD COLUMN IF NOT EXISTS color text
NOT NULL DEFAULT '#D9DDE2';

UPDATE public.member_groups AS g
SET color = v.color
FROM (
    VALUES
        ('Grid Team', '#9DBCE7'),
        ('Commissioning AU', '#A7D8B4'),
        ('Commissioning PH', '#65B382'),
        ('SCADA/Deployment AU', '#D4B8E7'),
        ('SCADA/Deployment PH', '#B28BD4'),
        ('Solutions Engineering AU', '#F1D09E'),
        ('Solutions Engineering IN', '#DDA85F'),
        ('Solutions Engineering PH', '#E9BA7C')
) AS v(name, color)
WHERE g.name = v.name
AND g.workspace_id =
    'b1a61e64-ec6d-43c1-b7c7-58ad0adc82fa'
AND g.color = '#D9DDE2';
