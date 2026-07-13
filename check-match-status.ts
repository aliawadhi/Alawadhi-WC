import { supabase } from "./src/utils/supabase";

async function checkMatch() {
  const matchId = '075f6bae-c73f-4ff3-8e37-8c4ae0ec214e';
  const { data, error } = await supabase
    .from('matches')
    .select('*')
    .eq('match_id', matchId);

  if (error) {
    console.error("Error querying match:", error);
  } else {
    console.log("Match:", data);
  }
}

checkMatch();
