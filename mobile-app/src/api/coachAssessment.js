"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchMyCoachAssessment = fetchMyCoachAssessment;
exports.submitCoachAssessment = submitCoachAssessment;
const config_1 = require("../config");
/**
 * Obtiene la evaluación del Coach IA del jugador actual.
 */
function fetchMyCoachAssessment(token) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!token)
            return null;
        try {
            const res = yield fetch(`${config_1.API_URL}/coach-assessment/me`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const json = (yield res.json());
            if (json.ok && json.assessment)
                return json.assessment;
            return null;
        }
        catch (err) {
            console.error('[fetchMyCoachAssessment]', err);
            return null;
        }
    });
}
/**
 * Envía las respuestas del cuestionario y obtiene el resultado calculado.
 */
function submitCoachAssessment(token, answers) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!token)
            return null;
        try {
            const res = yield fetch(`${config_1.API_URL}/coach-assessment`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ answers }),
            });
            const json = (yield res.json());
            if (json.ok && json.assessment)
                return json.assessment;
            throw new Error(json.error || 'Error al enviar la evaluación');
        }
        catch (err) {
            console.error('[submitCoachAssessment]', err);
            throw err;
        }
    });
}
