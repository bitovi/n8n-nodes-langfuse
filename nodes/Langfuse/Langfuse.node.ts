import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { Langfuse as LangfuseLib } from 'langfuse';

export class Langfuse implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Langfuse',
		name: 'langfuse',
		icon: 'file:langfuse.svg',
		group: ['transform'],
		version: 1,
		description: 'Log LLM input/output to Langfuse',
		defaults: {
			name: 'Langfuse',
		},
		inputs: ['main'],
		outputs: ['main'],
		properties: [
			{
				displayName: 'Action',
				name: 'action',
				type: 'options',
				options: [
					{
						name: 'Log To Langfuse',
						value: 'logToLangfuse',
					},
				],
				default: 'logToLangfuse',
			},
			{
				displayName: 'LLM Input',
				name: 'llmInput',
				type: 'string',
				default: '',
				required: true,
				description: 'The input sent to the LLM',
			},
			{
				displayName: 'LLM Output',
				name: 'llmOutput',
				type: 'string',
				default: '',
				required: true,
				description: 'The output received from the LLM',
			},
		],
	};
	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const input = this.getNodeParameter('llmInput', i) as string;
				const output = this.getNodeParameter('llmOutput', i) as string;

				await logToLangfuse(input, output);

				returnData.push({ json: { success: true } });
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: {
							error: error.message,
						},
					});
					continue;
				}
				throw error;
			}
		}

		return [returnData];
	}
}

async function logToLangfuse(input: string, output: string) {
	const langfuse = new LangfuseLib({
		publicKey: process.env.LANGFUSE_PUBLIC_KEY,
		secretKey: process.env.LANGFUSE_HOST,
		baseUrl: process.env.LANGFUSE_SECRET_KEY,
	});
	const trace = langfuse.trace({ name: 'ollama-test-trace', userId: 'n8n-manual-test' });
	await trace.update({ input, output });
	const span = trace.span({ name: 'ollama-inference' });
	await span.update({ input, output });
	await span.end();
	await langfuse.flush?.();
}
