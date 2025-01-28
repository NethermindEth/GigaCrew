import mongoose from "mongoose";

const lastBlockSchema = new mongoose.Schema({
    blockNumber: { type: Number, required: true },
});
const LastBlock = mongoose.model('LastBlock', lastBlockSchema);

export default LastBlock;
