const { config } = require("dotenv")
const express = require("express")
const fs = require("fs")
const path = require("path")
const admin = require("firebase-admin")
const cors = require("cors")

config()

const app = express()
const porta = 8282
const TOKENS_DB_PATH = path.join(__dirname, "tokens_db.json")

const corsOptions = {
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
    optionsSuccessStatus: 200
}
app.use(cors(corsOptions))

app.use(express.json())
app.use(express.urlencoded({ extended: true }))

try {
    const adminConfig = {
        projectId: process.env.FB_ADMIN_PROJECT_ID,
        clientEmail: process.env.FB_ADMIN_CLIENT_EMAIL,
        privateKey: process.env.FB_ADMIN_PRIVATE_KEY.replace(/\\n/g, "\n"),
    }

    if (!adminConfig.projectId || !adminConfig.clientEmail || !adminConfig.privateKey) {
        throw new Error("Credenciais Firebase Admin (projectId, clientEmail, privateKey) não definidas no .env")
    }

    admin.initializeApp({
        credential: admin.credential.cert(adminConfig)
    })

    const messaging = admin.messaging()
    console.log("Firebase Admin SDK inicializado com sucesso.")

} catch (error) {
    console.error("!!!!!!!!!! FALHA AO INICIALIZAR FIREBASE ADMIN SDK !!!!!!!!!!")
    console.error("Verifique as variáveis de ambiente FB_ADMIN_* e o formato da chave privada.")
    console.error("Erro:", error.message)
    process.exit(1)
}


const readTokensDB = () => {
    try {
        if (fs.existsSync(TOKENS_DB_PATH)) {
            const fileContent = fs.readFileSync(TOKENS_DB_PATH, "utf-8")
            return fileContent ? JSON.parse(fileContent) : {}
        }
    } catch (error) {
        console.error("[DB Read Error] Erro ao ler ou parsear tokens_db.json:", error)
    }
    return {}
}

const writeTokensDB = (data) => {
    try {
        fs.writeFileSync(TOKENS_DB_PATH, JSON.stringify(data, null, 2))
        return true
    } catch (error) {
        console.error("[DB Write Error] Erro ao escrever tokens_db.json:", error)
        return false
    }
}

const isValidInput = (token, email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return typeof token === 'string' && token.length > 10 &&
        typeof email === 'string' && email.length > 3 && emailRegex.test(email)
}

async function getUserEmailByTraccarUserId(userId) {
    console.log(`[Placeholder] Tentando encontrar email para Traccar User ID: ${userId}`)
}

app.get("/api/check-user-token", (req, res) => {
    const email = req.query.email

    if (!email || typeof email !== 'string') {
        return res.status(400).json({ error: "Email inválido ou não fornecido na query." })
    }

    const tokensDB = readTokensDB()
    const userTokens = tokensDB[email] || []

    console.log(`[/api/check-user-token] Verificando tokens para ${email}. Encontrados: ${userTokens.length}`)
    res.status(200).json({ tokens: userTokens })
})


app.post("/api/savetoken", (req, res) => {
    const { fcmToken, email } = req.body

    console.log(`[/api/savetoken] Recebido: token=${fcmToken?.substring(0, 10)}..., email=${email}`)

    if (!isValidInput(fcmToken, email)) {
        console.log("[/api/savetoken] Input inválido (token ou email).")
        return res.status(400).json({ error: "Token FCM ou Email inválido.", registered: false })
    }

    const tokensDB = readTokensDB()
    let message = ""
    let needsWrite = false

    if (tokensDB[email]) { // Email já existe?
        if (tokensDB[email].includes(fcmToken)) { // Token já existe para este email?
            message = "Token já estava registrado para este email."
            console.log(`[/api/savetoken] Token já existe para ${email}. Nenhuma alteração.`)
        } else { // Adiciona token ao email existente
            tokensDB[email].push(fcmToken)
            message = "Novo token adicionado para este email."
            needsWrite = true
            console.log(`[/api/savetoken] Novo token adicionado para ${email}.`)
        }
    } else { // Novo email
        tokensDB[email] = [fcmToken]
        message = "Novo email e token registrados."
        needsWrite = true
        console.log(`[/api/savetoken] Novo email (${email}) e token registrados.`)
    }

    if (needsWrite) {
        if (!writeTokensDB(tokensDB)) {
            console.error("[/api/savetoken] Falha ao escrever no arquivo DB.")
            // Retorna 500 mas indica falha no registro para o frontend
            return res.status(500).json({ error: "Erro interno ao salvar token.", registered: false })
        }
    }

    // Retorna sucesso, indicando que o token está (ou já estava) registrado
    res.status(200).json({ message: message, registered: true })
})


app.post("/api/delete-token", (req, res) => {
    const { fcmToken, email } = req.body

    console.log(`[/api/delete-token] Recebido: token=${fcmToken?.substring(0, 10)}..., email=${email}`)

    if (!isValidInput(fcmToken, email)) {
        console.log("[/api/delete-token] Input inválido (token ou email).")
        return res.status(400).json({ error: "Token FCM ou Email inválido." })
    }

    const tokensDB = readTokensDB()
    let tokenRemoved = false

    if (tokensDB[email]) {
        const initialLength = tokensDB[email].length
        tokensDB[email] = tokensDB[email].filter(token => token !== fcmToken) // Remove o token

        if (tokensDB[email].length < initialLength) { // Verifica se algo foi removido
            tokenRemoved = true
            console.log(`[/api/delete-token] Token removido para ${email}.`)

            // Opcional: Remover email se lista ficar vazia
            if (tokensDB[email].length === 0) {
                delete tokensDB[email]
                console.log(`[/api/delete-token] Email ${email} removido do DB (lista vazia).`)
            }

            if (!writeTokensDB(tokensDB)) { // Salva alterações
                console.error("[/api/delete-token] Falha ao escrever no arquivo DB após remoção.")
                return res.status(500).json({ error: "Erro interno ao atualizar o estado do token." })
            }
        } else {
            console.log(`[/api/delete-token] Token não encontrado para ${email}. Nenhuma alteração.`)
        }
    } else {
        console.log(`[/api/delete-token] Email ${email} não encontrado no DB.`)
    }

    if (tokenRemoved) {
        res.status(200).json({ message: "Token desregistrado com sucesso." })
    } else {
        // Retorna 200 mesmo se não encontrou, pois o estado desejado (token não existe) foi alcançado
        res.status(200).json({ message: "Token ou email não encontrado, nada a fazer." })
    }
})


app.post("/api/traccar-event", async (req, res) => {
    try {
        console.log("--- Evento Recebido do Traccar ---")
        // console.log("Body:", JSON.stringify(req.body, null, 2)) // Log detalhado opcional

        const event = req.body.event
        const device = req.body.device

        if (!event || !device) {
            console.log("[Traccar Event] Evento ou dispositivo ausente no payload.")
            return res.status(200).send("Payload inválido, mas recebido.") // OK para Traccar
        }

        // 1. Identificar o Usuário
        if (!device.userId) {
            console.log(`[Traccar Event] Evento ${event.type} para device ${device.id} sem userId.`)
            return res.status(200).send("Evento recebido, userId ausente.")
        }

        const userEmail = await getUserEmailByTraccarUserId(device.userId)
        if (!userEmail) {
            console.log(`[Traccar Event] Email não encontrado para Traccar UserID ${device.userId}.`)
            return res.status(200).send("Evento recebido, usuário não mapeado.")
        }
        console.log(`[Traccar Event] Evento para usuário ${userEmail} (Device: ${device.name || device.id})`)

        // 2. Buscar Tokens do Usuário
        const tokensDB = readTokensDB()
        const userTokens = tokensDB[userEmail] || []

        if (userTokens.length === 0) {
            console.log(`[Traccar Event] Nenhum token FCM encontrado para ${userEmail}.`)
            return res.status(200).send("Evento recebido, nenhum token para o usuário.")
        }
        console.log(`[Traccar Event] ${userTokens.length} tokens encontrados para ${userEmail}.`)

        // 3. Montar a Notificação
        let notificationTitle = `Traccar: ${device.name || `ID ${device.id}`}`
        let notificationBody = `Evento: ${event.type}`
        switch (event.type) { // Mantenha seu switch case aqui
            case "deviceOnline": notificationBody = `${device.name} está online.`
                break
            case "deviceOffline": notificationBody = `${device.name} ficou offline.`
                break
            case "deviceUnknown": notificationBody = `${device.name} ficou offline.`
                break
            default: notificationBody = `Novo evento "${event.type}" para ${device.name}.`
        }

        // 4. Enviar Notificações (Multicast)
        const message = {
            notification: { title: notificationTitle, body: notificationBody },
            tokens: userTokens,
        }

        console.log(`[Traccar Event] Enviando para ${userTokens.length} tokens de ${userEmail}...`)
        const messaging = admin.messaging() // Garante que temos a instância
        const response = await messaging.sendEachForMulticast(message)
        console.log(`[Traccar Event] Resultado: ${response.successCount} sucessos, ${response.failureCount} falhas.`)

        // 5. Limpeza de Tokens Inválidos
        if (response.failureCount > 0) {
            const tokensToDelete = []
            response.responses.forEach((resp, idx) => {
                if (!resp.success) {
                    const failedToken = userTokens[idx]
                    console.error(`[Traccar Event] Falha token ${failedToken.substring(0, 10)}...: ${resp.error.code}`)
                    if (resp.error.code === "messaging/invalid-registration-token" ||
                        resp.error.code === "messaging/registration-token-not-registered") {
                        tokensToDelete.push(failedToken)
                    }
                }
            })

            if (tokensToDelete.length > 0) {
                console.warn(`[Traccar Event] Removendo ${tokensToDelete.length} tokens inválidos para ${userEmail}...`)
                const currentDB = readTokensDB() // Lê DB novamente
                if (currentDB[userEmail]) {
                    currentDB[userEmail] = currentDB[userEmail].filter(t => !tokensToDelete.includes(t))
                    if (currentDB[userEmail].length === 0) delete currentDB[email] // Remove email se vazio
                    writeTokensDB(currentDB) // Salva DB atualizado
                }
            }
        }

        res.status(200).send(`Evento processado. ${response.successCount} notificações enviadas.`)

    } catch (error) {
        console.error("[/api/traccar-event] Erro GERAL ao processar evento:", error)
        res.status(200).send("Erro interno ao processar evento.") // OK para Traccar
    }
})

app.post("/api/sendnotification", async (req, res) => {
    const { email, token, notification } = req.body

    if (!notification || !notification.title || !notification.body) {
        return res.status(400).json({ error: "Formato de notificação inválido." })
    }

    let targetTokens = []

    if (email && typeof email === 'string') { // Enviar por email?
        console.log(`[Send Notify] Enviando para email: ${email}`)
        const tokensDB = readTokensDB()
        targetTokens = tokensDB[email] || []
        if (targetTokens.length === 0) {
            console.log(`[Send Notify] Nenhum token encontrado para o email ${email}.`)
            return res.status(404).json({ error: `Nenhum token encontrado para o email ${email}.` })
        }
    } else if (token && typeof token === 'string') { // Enviar por token direto?
        console.log(`[Send Notify] Enviando para token direto: ${token.substring(0, 10)}...`)
        targetTokens = [token]
    } else {
        return res.status(400).json({ error: "É necessário fornecer 'email' ou 'token' no body." })
    }

    const message = { notification: notification, tokens: targetTokens }
    const messaging = admin.messaging()

    try {
        console.log(`[Send Notify] Enviando para ${targetTokens.length} tokens...`)
        const response = await messaging.sendEachForMulticast(message)
        console.log(`[Send Notify] Resultado: ${response.successCount} sucessos, ${response.failureCount} falhas.`)

        // Aqui também poderia adicionar a lógica de limpeza de tokens se desejado

        if (response.successCount > 0) {
            res.status(200).json({ success: true, message: `Enviado com ${response.successCount} sucessos.` })
        } else {
            res.status(500).json({ error: "Falha ao enviar para todos os tokens.", details: response.responses })
        }
    } catch (error) {
        console.error("[Send Notify] Erro GERAL ao enviar:", error)
        res.status(500).json({ error: "Erro interno do servidor ao enviar notificação." })
    }
})

app.listen(porta, () => {
    console.log(`-------------------------------------------------------`)
    console.log(`🚀 Servidor backend Node.js rodando na porta ${porta}`)
    console.log(`   Ambiente: ${process.env.NODE_ENV || 'development'}`)
    console.log(`-------------------------------------------------------`)

    if (!fs.existsSync(TOKENS_DB_PATH)) {
        if (writeTokensDB({})) {
            console.log(`Arquivo de tokens ${TOKENS_DB_PATH} criado com sucesso.`)
        } else {
            console.error(`FALHA ao criar o arquivo de tokens ${TOKENS_DB_PATH}. Verifique as permissões.`)
        }
    } else {
        console.log(`Usando arquivo de tokens existente: ${TOKENS_DB_PATH}`)
    }
})