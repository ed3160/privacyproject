// Hand-placed waypoints [lon, lat] at real public intersections and park paths in
// Morningside Heights / Riverside Park / Morningside Park, Manhattan.
// Each list is routed over OpenStreetMap foot paths (see sources.mjs), so the final
// geometry follows real streets and park paths rather than straight lines.
// All routes start/end on the Broadway sidewalk at the Barnard campus block (~W 117th St).
export const START = [-73.9637, 40.8088];

export const WAYPOINTS = {
  // A. Weekday loop: W 116th -> Riverside Park north -> W 122nd east -> Amsterdam south
  //    -> Morningside Park (116th stairs down, 113th up) -> W 114th -> Broadway -> Barnard
  A: [
    START,
    [-73.96607, 40.80941], // Riverside Park, near W 116th
    [-73.96860, 40.80720], // Riverside Park lower path, ~W 113th (loop south first)
    [-73.96676, 40.81007], // Riverside Park inner path, ~W 117th
    [-73.96511, 40.81120], // Riverside Park path, ~W 119th
    [-73.96415, 40.81193], // Riverside Park path, ~W 120th
    [-73.96231, 40.81242], // Claremont Ave & W 122nd
    [-73.95730, 40.81120], // Amsterdam Ave & W 122nd
    [-73.96031, 40.80789], // Amsterdam Ave, ~W 118th
    [-73.95939, 40.80623], // Morningside Dr & W 116th (top of stairs)
    [-73.95883, 40.80574], // Morningside Park, below the 116th St stairs
    [-73.95858, 40.80474], // Giraffe Path, ~W 114th
    [-73.95870, 40.80330], // Morningside Park, east of the pond
    [-73.95973, 40.80207], // Morningside Park, south end (~W 110th)
    [-73.96363, 40.80276], // Amsterdam Ave & Cathedral Pkwy (W 110th)
    [-73.96176, 40.80568], // Amsterdam Ave & W 114th
    [-73.96550, 40.80660], // Broadway & W 114th
    START,
  ],
  // B. Sunday out-and-back south through Riverside Park
  B: [
    START,
    [-73.96607, 40.80941], // Riverside Park, near W 116th
    [-73.97350, 40.79790], // Riverside Park, ~W 100th
    [-73.98580, 40.78210], // Riverside Park, ~W 75th (turnaround)
    [-73.97350, 40.79790],
    [-73.96607, 40.80941],
    START,
  ],
  // C. Short Morningside loop: W 112th -> Cathedral Pkwy -> Morningside Park -> Morningside Dr -> W 120th
  C: [
    START,
    [-73.96642, 40.80534], // Broadway & W 112th
    [-73.96268, 40.80442], // Amsterdam Ave & W 112th
    [-73.96363, 40.80276], // Amsterdam Ave & Cathedral Pkwy (W 110th)
    [-73.95973, 40.80207], // Morningside Park, south end (~W 110th)
    [-73.95870, 40.80330], // east of Morningside Pond
    [-73.95858, 40.80474], // Giraffe Path, ~W 114th
    [-73.95883, 40.80574], // up the 116th St stairs
    [-73.95939, 40.80623], // Morningside Dr & W 116th
    [-73.95755, 40.80875], // Morningside Dr & W 120th
    [-73.96197, 40.81034], // Broadway & W 120th
    START,
  ],
};
