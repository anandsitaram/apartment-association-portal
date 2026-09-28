// Fictional white-label demo records: 20 flats in Block A and 20 in Block C.
// Owner names are invented and intended only for disposable demo environments.
const ownerNames = [
  "Alex Morgan",
  "Jamie Taylor",
  "Casey Jordan",
  "Riley Parker",
  "Avery Reed",
  "Drew Ellis",
  "Taylor Quinn",
  "Morgan Lane",
  "Cameron Blake",
  "Jordan Avery",
  "Sam Rowan",
  "Robin Ellis",
  "Skyler Brooks",
  "Emerson Gray",
  "Harper Lee",
  "Parker Ellis",
  "Reese Campbell",
  "Finley Morgan",
  "Dakota James",
  "Charlie Avery",
  "Rowan Taylor",
  "Payton Reed",
  "Kendall Blake",
  "Sage Parker",
  "River Quinn",
  "Phoenix Lane",
  "Arden Brooks",
  "Jules Harper",
  "Micah Stone",
  "Remy Bailey",
  "Shiloh Bennett",
  "Ellis Monroe",
  "Noah Finley",
  "Ari Collins",
  "Kai Dawson",
  "Milan Hayes",
  "Rory West",
  "Skye Palmer",
  "Emery Scott",
  "Lane Foster",
];
const sizes = [
  { type: "3BHK", bua: 1706.26, uds: 557.49 },
  { type: "2BHK", bua: 1202.8, uds: 392.99 },
  { type: "2BHK", bua: 1195.54, uds: 390.62 },
  { type: "2BHK", bua: 1205.7, uds: 393.94 },
  { type: "3BHK", bua: 1651.12, uds: 539.48 },
  { type: "2BHK", bua: 1217.31, uds: 397.73 },
  { type: "3BHK", bua: 1764.29, uds: 576.45 },
  { type: "3BHK", bua: 1706.26, uds: 557.49 },
  { type: "2BHK", bua: 1202.8, uds: 392.99 },
  { type: "2BHK", bua: 1195.54, uds: 390.62 },
];
const blocks = ["A", "C"];
const flats = blocks.flatMap((block, blockIndex) =>
  Array.from({ length: 20 }, (_, unitIndex) => {
    const sl = blockIndex * 20 + unitIndex + 1;
    const unit = 101 + unitIndex;
    const size = sizes[unitIndex % sizes.length];
    return {
      sl,
      flat: `${block}-${unit}`,
      block,
      name: ownerNames[sl - 1],
      type: size.type,
      bua: size.bua,
      uds: size.uds,
    };
  }),
);

export default flats;
