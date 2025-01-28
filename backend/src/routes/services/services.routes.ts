import { Router } from 'express';
import { Service } from '../../models/Service';
import { getEmbedding } from '../../utils';

const router = Router();

// List all available services with pagination
router.get('/', async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  const numPage = Number(page);
  const numLimit = Number(limit);

  if (numPage < 1 || isNaN(numPage)) {
    return res.status(400).json({ message: 'Page must be a positive number > 0' });
  }

  if (numLimit < 1 || isNaN(numLimit) || numLimit > 100) {
    return res.status(400).json({ message: 'Limit must be a positive number between 1 and 100' });
  }

  const skip = (numPage - 1) * numLimit;

  try {
    const [services, total] = await Promise.all([
      Service.find({}).skip(skip).limit(numLimit),
      Service.countDocuments()
    ]);

    res.json({
      services,
      pagination: {
        total,
        page: numPage,
        limit: numLimit,
        pages: Math.ceil(total / numLimit)
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching services' });
  }
});

// Search services by title using searchIndex based on embedding
router.get('/search', async (req, res) => {
  const { query, limit = 10, cutoff = 0.75 } = req.query;

  if (!query || typeof query !== 'string') {
    return res.status(400).json({ message: 'Search query is required' });
  }

  const numLimit = Number(limit);
  if (isNaN(numLimit) || numLimit <= 0) {
    return res.status(400).json({ message: 'Limit must be a positive number' });
  }

  const numCutoff = Number(cutoff);
  if (isNaN(numCutoff) || numCutoff <= 0 || numCutoff >= 1) {
    return res.status(400).json({ message: 'Cutoff must be a number between 0 and 1' });
  }

  if (numLimit > 100) {
    return res.status(400).json({ message: 'Limit must be less than 100' });
  }

  const agg = [
    {
      $vectorSearch: {
        index: 'vector_index',
        path: 'embedding',
        queryVector: await getEmbedding(query),
        numCandidates: numLimit,
        limit: numLimit,
      }
    },
    {
      $project: {
        serviceId: 1,
        title: 1,
        description: 1,
        price: 1,
        seller: 1,
        score: {
          $meta: 'vectorSearchScore'
        }
      }
    },
    {
      $match: {
        score: {
          $gte: numCutoff
        }
      }
    },
  ];

  try {
    const services = await Service.aggregate(agg);
    res.json(services);
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ message: 'Error searching services' });
  }
});

// Get service by serviceId
router.get('/:serviceId', async (req, res) => {
  try {
    const service = await Service.findOne({ serviceId: req.params.serviceId });
    if (!service) {
      return res.status(404).json({ message: 'Service not found' });
    }
    res.json(service);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching service' });
  }
});

export default router; 
