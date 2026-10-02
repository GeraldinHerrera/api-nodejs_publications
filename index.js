require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const JAVA_SERVICE_URL = process.env.JAVA_SERVICE_URL || 'http://localhost:8080/api/posts';
const DOTNET_SERVICE_URL = process.env.DOTNET_SERVICE_URL || 'http://localhost:5000/api/posts';
const TIMEOUT_MS = 6000;

const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'API Gateway Orquestador Node.js',
      version: '1.0.0',
      description: 'Documentación del Orquestador con patrón Circuit Breaker & Fallback (Java Primario / .NET Secundario).'
    },
    servers: [{ url: `http://localhost:${PORT}` }]
  },
  apis: ['./index.js']
};

const swaggerDocs = swaggerJsdoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));


async function requestWithFallback(method, path = '', data = null) {
  const javaUrl = path ? `${JAVA_SERVICE_URL.replace(/\/$/, '')}/${path.replace(/^\//, '')}` : JAVA_SERVICE_URL;
  const dotnetUrl = path ? `${DOTNET_SERVICE_URL.replace(/\/$/, '')}/${path.replace(/^\//, '')}` : DOTNET_SERVICE_URL;

  try {
    const javaResponse = await axios({
      method,
      url: javaUrl,
      data,
      timeout: TIMEOUT_MS
    });
    return {
      status: 'success',
      fuente: 'servicio_primario_java',
      data: javaResponse.data
    };
  } catch (javaError) {
    console.warn(`[CIRCUIT BREAKER] Fallo servicio primario Java (${javaError.message}). Conmutando a Fallback (.NET)...`);
  }

  try {
    const dotnetResponse = await axios({
      method,
      url: dotnetUrl,
      data,
      timeout: TIMEOUT_MS
    });
    return {
      status: 'degraded_success',
      fuente: 'servicio_secundario_dotnet',
      data: dotnetResponse.data
    };
  } catch (dotnetError) {
    console.error(`[CIRCUIT BREAKER] Fallo servicio secundario .NET (${dotnetError.message}). Ambos servicios no estan disponibles.`);
    throw new Error('Todos los microservicios de persistencia (Java y .NET) estan fuera de servicio.');
  }
}

app.get('/api/posts', async (req, res) => {
  try {
    const result = await requestWithFallback('GET');
    return res.status(200).json(result);
  } catch (error) {
    return res.status(503).json({
      status: 'error',
      mensaje: error.message,
      detalles: 'Servicio degradado. Ni el microservicio primario Java ni el secundario .NET respondieron a tiempo.'
    });
  }
});


app.get('/api/posts/:id', async (req, res) => {
  try {
    const result = await requestWithFallback('GET', req.params.id);
    return res.status(200).json(result);
  } catch (error) {
    return res.status(503).json({
      status: 'error',
      mensaje: error.message
    });
  }
});


app.post('/api/posts', async (req, res) => {
  try {
    const result = await requestWithFallback('POST', '', req.body);
    return res.status(201).json(result);
  } catch (error) {
    return res.status(503).json({
      status: 'error',
      mensaje: error.message
    });
  }
});

/**
 * @openapi
 * /api/posts/{id}:
 *   put:
 *     summary: Actualizar una publicacion por ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               caption:
 *                 type: string
 *               file:
 *                 type: string
 *               post_type:
 *                 type: string
 *     responses:
 *       200:
 *         description: Publicacion actualizada exitosamente.
 *       503:
 *         description: Error de disponibilidad.
 */
app.put('/api/posts/:id', async (req, res) => {
  try {
    const result = await requestWithFallback('PUT', req.params.id, req.body);
    return res.status(200).json(result);
  } catch (error) {
    return res.status(503).json({
      status: 'error',
      mensaje: error.message
    });
  }
});

app.delete('/api/posts/:id', async (req, res) => {
  try {
    const result = await requestWithFallback('DELETE', req.params.id);
    return res.status(200).json(result);
  } catch (error) {
    return res.status(503).json({
      status: 'error',
      mensaje: error.message
    });
  }
});

app.get('/', (req, res) => {
  res.json({
    microservicio: 'orquestador_node',
    estado: 'operativo',
    patron: 'Circuit Breaker / Fallback',
    rutas: ['GET /api/posts', 'POST /api/posts', 'PUT /api/posts/:id', 'DELETE /api/posts/:id']
  });
});

app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚀 Orquestador Node.js ejecutandose en puerto ${PORT}`);
  console.log(`☕ Java Primary Service: ${JAVA_SERVICE_URL}`);
  console.log(`⚡ .NET Fallback Service: ${DOTNET_SERVICE_URL}`);
  console.log(`====================================================`);
});
