import { requireAuth } from './_lib/auth.js';
import { supabaseAdmin } from './_lib/supabaseAdmin.js';
import { sendError } from './_lib/respond.js';

export default async function handler(req, res) {
  try {
    const { companyId } = await requireAuth(req);

    if (req.method === 'GET') {
      const { data, error } = await supabaseAdmin
        .from('vendors').select('*').eq('company_id', companyId).order('name');
      if (error) throw error;
      return res.status(200).json({ vendors: data });
    }

    if (req.method === 'POST') {
      const body = req.body;

      // Bulk import — used by CSV-paste and Google Sheet URL import: { vendors: [...] }
      if (Array.isArray(body.vendors)) {
        const rows = body.vendors.map(v => ({
          company_id: companyId,
          name: v.name, email: v.email, phone: v.phone || null,
          contact: v.contact, categories: v.categories || [], products: v.products
        }));
        const { data, error } = await supabaseAdmin.from('vendors').insert(rows).select();
        if (error) throw error;
        return res.status(201).json({ vendors: data });
      }

      // Single manual entry — the "add one at a time" form in Settings
      const { name, email, phone, contact, categories, products } = body;
      if (!name) { const err = new Error('Vendor name is required'); err.status = 400; throw err; }
      const { data, error } = await supabaseAdmin.from('vendors').insert({
        company_id: companyId, name, email, phone: phone || null, contact,
        categories: categories || [], products
      }).select().single();
      if (error) throw error;
      return res.status(201).json({ vendor: data });
    }

    if (req.method === 'PUT') {
      const { id, ...fields } = req.body;
      if (!id) { const err = new Error('Vendor id required'); err.status = 400; throw err; }
      const { data, error } = await supabaseAdmin.from('vendors')
        .update(fields).eq('id', id).eq('company_id', companyId).select().single();
      if (error) throw error;
      return res.status(200).json({ vendor: data });
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) { const err = new Error('Vendor id required'); err.status = 400; throw err; }
      const { error } = await supabaseAdmin.from('vendors').delete().eq('id', id).eq('company_id', companyId);
      if (error) throw error;
      return res.status(204).end();
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    sendError(res, err);
  }
}
