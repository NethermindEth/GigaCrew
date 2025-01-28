import { dotProduct, getEmbedding } from '../utils';
import { config } from 'dotenv';

config(); // Load environment variables

async function testEmbeddings() {
  try {
    // Test similarity between two phrases
    console.log('\nTesting similarity...');
    const embedding1 = await getEmbedding('Web Development');
    const embedding2 = await getEmbedding('Website Development');
    const embedding3 = await getEmbedding('Spider Web Development');
    
    // Calculate dot product similarity
    let similarity = dotProduct(embedding1, embedding2);
    console.log('Similarity between "Web Development" and "Website Development":', similarity);

    similarity = dotProduct(embedding1, embedding3);
    console.log('Similarity between "Web Development" and "Spider Web Removal":', similarity);
  } catch (error) {
    console.error('Error:', error);
  }
}

// Run the tests
testEmbeddings().then(() => console.log('Tests completed'));
