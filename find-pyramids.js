// Quick script to find the "5 20 cell pyramids" shape in Supabase
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'YOUR_SUPABASE_URL'
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'YOUR_ANON_KEY'
const supabase = createClient(supabaseUrl, supabaseKey)

async function findPyramids() {
  // Search for shapes with "pyramid" in the name
  const { data, error } = await supabase
    .from('shapes')
    .select('*')
    .ilike('name', '%20 cell%pyramid%')
  
  if (error) {
    console.error('Error:', error)
    return
  }
  
  console.log('Found shapes:', data)
  
  // Also try broader search
  const { data: allPyramids, error: err2 } = await supabase
    .from('shapes')
    .select('*')
    .ilike('name', '%pyramid%')
  
  if (!err2) {
    console.log('\nAll pyramid shapes:', allPyramids)
  }
}

findPyramids()
