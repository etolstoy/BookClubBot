import { describe, it, expect } from 'vitest';
import { normalizeCollectionISBN, findCollectionBookMatch } from '../../src/lib/collection-matching.js';

describe('collection catalogue matching', () => {
  const source={isbn:'9780306406157',titleAliases:['Test Book'],authorAliases:['Test Author']};
  it('matches ISBN-10 and ISBN-13 including prefixes, punctuation, and checksums',()=>{
    expect(normalizeCollectionISBN('ISBN-10: 0-306-40615-2')).toBe('9780306406157');
    expect(normalizeCollectionISBN('9780306406158')).toBeNull();
    expect(findCollectionBookMatch(source,[{id:1,title:'Translated title',author:'Test Author',isbn:'0-306-40615-2'}])).toBe(1);
  });
  it('prefers the existing edition with more reviews when duplicate ISBNs exist',()=>{
    expect(findCollectionBookMatch(source,[{id:1,title:'Test Book',author:'Test Author',isbn:source.isbn,_count:{reviews:1}},{id:2,title:'Test Book',author:'Test Author',isbn:source.isbn,_count:{reviews:7}}])).toBe(2);
  });
  it('requires matching authors for title aliases and refuses ambiguous title matches',()=>{
    expect(findCollectionBookMatch(source,[{id:1,title:'Test Book',author:'Other Author',isbn:null}])).toBeNull();
    expect(findCollectionBookMatch(source,[{id:1,title:'Test Book',author:null,isbn:null}])).toBeNull();
    expect(findCollectionBookMatch(source,[{id:1,title:'Test Book',author:'Test Author',isbn:null}])).toBe(1);
    expect(findCollectionBookMatch(source,[{id:1,title:'Test Book',author:'Test Author',isbn:null},{id:2,title:'Test Book',author:'Test Author',isbn:null}])).toBeNull();
  });
  it('matches a full subtitle and a transliterated author without matching other works',()=>{
    const translated={isbn:'9780306406157',titleAliases:['Долг: первые 5000 лет истории'],authorAliases:['David Graeber']};
    expect(findCollectionBookMatch(translated,[{id:4,title:'Долг: первые 5000 лет истории',author:'Дэвид Гребер',isbn:null}])).toBe(4);
    const withSubtitle={...source,titleAliases:['A Long Book Title: The Subtitle']};
    expect(findCollectionBookMatch(withSubtitle,[{id:5,title:'A Long Book Title',author:'Test Author',isbn:null}])).toBe(5);
    expect(findCollectionBookMatch({...source,titleAliases:['Граф Аверин. Колдун Российской империи'],authorAliases:['Виктор Дашкевич']},[{id:7,title:'Императорский Див. Колдун Российской империи',author:'Виктор Дашкевич',isbn:null}])).toBeNull();
  });
});
