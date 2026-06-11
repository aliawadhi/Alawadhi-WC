import { supabase } from "./src/utils/supabase";

async function checkTables() {
  try {
    const supabaseUrl = 'https://cumbseixzwzuqhpsezqh.supabase.co';
    const res = await fetch(`${supabaseUrl}/rest/v1/`, {
      headers: {
        'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN1bWJzZWl4end6dXFocHNlenFoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4MzQ2ODQsImV4cCI6MjA5NDQxMDY4NH0.GwuAcgyt2wuWQdxonyRULnz-kuLO0yOopKqGH2g2OrU'
      }
    });
    const data = await res.json();
    console.log("Tables in public schema:", Object.keys(data.definitions || {}));
  } catch (err) {
    console.error("Error:", err);
  }
}

checkTables();
