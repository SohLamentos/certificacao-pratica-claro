-- 0006_add_image_signature_to_ia_evidencias.sql
-- Migration to support image_signature in ia_evidencias table

ALTER TABLE ia_evidencias
ADD COLUMN image_signature TEXT;
