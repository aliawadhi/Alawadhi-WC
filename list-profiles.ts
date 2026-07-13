import { supabase } from "./src/utils/supabase";

async function listProfiles() {
  const { data, error } = await supabase.from('profiles').select('*');
  if (error) {
    console.error("Error querying profiles:", error);
  } else {
    console.log("All profiles:", data);
  }
}

listProfiles();
