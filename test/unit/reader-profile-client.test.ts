import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReaderProfileClient, READER_PROFILE_PROMPT, countProfileWords } from "../../src/clients/llm/reader-profile-client.js";

const { create } = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("openai", () => ({ default: class { responses = { create }; } }));
const reviews = [{id: 20, title: 'Последняя книга', author: 'Автор', reviewText: 'Самая новая рецензия целиком.', reviewedAt: '2026-11-15T00:00:00.000Z'},
  {id: 19, title: 'Previous', author: null, reviewText: 'Previous full review.', reviewedAt: '2026-11-14T00:00:00.000Z'}];
const response = (text: string) => ({ status: 'completed', output: [{type:'message',content:[{type:'output_text',text}]}],usage:{input_tokens:120,output_tokens:40} });
beforeEach(()=>create.mockReset());afterEach(()=>vi.restoreAllMocks());

describe('Terra reader profile',()=>{
  it('uses Terra high, the exact requested prompt, and full review evidence with the latest identified',async()=>{
    create.mockResolvedValue(response('Ты читаешь книги, а книги уже читают тебя.'));
    const r=await new ReaderProfileClient('test_key').generate(reviews);
    expect(r.text).toContain('Ты читаешь');expect(r.inputTokens).toBe(120);
    const request=create.mock.calls[0][0];
    expect(request.model).toBe('gpt-6.1-terra');expect(request.reasoning).toEqual({effort:'high'});
    expect(request.instructions).toBe(READER_PROFILE_PROMPT);expect(request.store).toBe(false);
    expect(request.input).toContain('Последний отзыв: ID 20, книга «Последняя книга»');
    for(const review of reviews)expect(request.input).toContain(review.reviewText);
  });
  it('retries an oversized response and retains usage for both calls',async()=>{
    create.mockResolvedValueOnce(response(Array(201).fill('слово').join(' '))).mockResolvedValueOnce(response('Короткая прожарка.'));
    const r=await new ReaderProfileClient('test_key').generate(reviews);
    expect(countProfileWords(r.text)).toBe(2);expect(r.inputTokens).toBe(240);expect(create).toHaveBeenCalledTimes(2);
  });
  it('rejects repeatedly oversized text rather than storing more than 200 words',async()=>{
    create.mockResolvedValue(response(Array(201).fill('слово').join(' ')));
    await expect(new ReaderProfileClient('test_key').generate(reviews)).rejects.toThrow('exceeds 200 words');
  });
  it.each(['empty','incomplete','refusal'])('rejects unusable output: %s',async kind=>{
    const r=response('');
    if(kind==='incomplete')r.status='incomplete';
    if(kind==='refusal')r.output=[];
    create.mockResolvedValue(r);
    await expect(new ReaderProfileClient('test_key').generate(reviews)).rejects.toThrow();
  });
  it('rejects missing reviews or more than the 20-review limit',async()=>{
    const c=new ReaderProfileClient('test_key');
    await expect(c.generate([])).rejects.toThrow();await expect(c.generate(Array(21).fill(reviews[0]))).rejects.toThrow();
    expect(create).not.toHaveBeenCalled();
  });
});
