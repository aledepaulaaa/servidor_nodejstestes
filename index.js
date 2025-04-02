const express = require("express")
const cors = require("cors") // <-- Importe o CORS
const app = express()

const porta = 4545

app.use(cors()) // <-- Use o middleware CORS (permite requisições do seu frontend)
app.use(express.json()) // Middleware para parsear JSON (correto)
app.use(express.urlencoded({ extended: true })) // Para dados de formulário (opcional aqui)

// Endpoint para teste
app.post("/api/servidordeteste", (req, res) => {
    // Acesse o objeto enviado pelo cliente
    const corpoRecebido = req.body
    console.log("Corpo da requisição recebido: ", corpoRecebido)

    // Para ver a mensagem específica:
    const mensagemRecebida = corpoRecebido.mensagem // Acessa a chave "mensagem" que enviamos
    console.log("Mensagem específica recebida: ", mensagemRecebida)

    // Verifique se a mensagem foi recebida (opcional)
    if (mensagemRecebida) {
        res.status(200).send({
            mensagem: "Dados recebidos com sucesso!",
            dados: "Ok deu certo", // A resposta que você espera
            dados_recebidos: mensagemRecebida // Pode ecoar o que recebeu
        })
    } else {
        res.status(400).send({ // Bad Request
            mensagem: "Erro: corpo da requisição inválido ou sem a chave 'mensagem'.",
            dados: null
        })
    }
})

app.listen(porta, () => {
    console.log(`Servidor rodando na porta ${porta}`)
})